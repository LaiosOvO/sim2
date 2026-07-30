import type { CustomBlockV1 } from '@sim/api-contracts/custom-blocks'
import { createRequestAuthenticator } from '@sim/auth/request-context'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CustomBlockModuleDependencies } from '@/modules/custom-blocks'
import { createCustomBlockModule } from '@/modules/custom-blocks'
import type { CustomBlockRepository } from '@/modules/custom-blocks/ports/custom-block-repository'

const block: CustomBlockV1 = {
  id: 'block-1',
  organizationId: 'org-1',
  workflowId: 'workflow-1',
  workflowName: 'Child',
  workspaceId: 'workspace-1',
  workspaceName: 'Workspace',
  type: 'custom_block_fixed',
  name: 'Child block',
  description: '',
  iconUrl: null,
  enabled: true,
  inputFields: [{ id: 'city', name: 'City', type: 'string', required: true }],
  exposedOutputs: [],
}

function sessionAuthentication() {
  return createRequestAuthenticator({
    sessions: {
      async verify(headers) {
        return headers.get('cookie') === 'session=valid'
          ? {
              verified: true as const,
              credential: {
                actor: {
                  id: 'user-1',
                  type: 'user' as const,
                  name: 'User',
                  email: 'user@example.com',
                },
                sessionId: 'session-1',
                activeOrganizationId: 'org-1',
              },
            }
          : { verified: false as const, reason: 'invalid' as const }
      },
    },
    apiKeys: {
      async verify() {
        return {
          verified: true as const,
          credential: {
            actor: { id: 'user-1', type: 'user' as const },
            keyId: 'key-1',
            keyType: 'personal' as const,
            workspaceId: null,
          },
        }
      },
    },
  })
}

function setup(overrides: Partial<CustomBlockModuleDependencies> = {}) {
  const repository: CustomBlockRepository = {
    findWorkspaceOrganization: vi.fn(async () => 'org-1'),
    listWithInputs: vi.fn(async () => [block]),
    publish: vi.fn(async () => block),
    findManageContext: vi.fn(async () => ({
      organizationId: 'org-1',
      sourceWorkspaceId: 'workspace-1',
      type: block.type,
      name: block.name,
    })),
    update: vi.fn(async () => true),
    delete: vi.fn(async () => true),
    countUsages: vi.fn(async () => ({ usageCount: 3, deployedUsageCount: 2 })),
  }
  const audit = {
    published: vi.fn(),
    updated: vi.fn(),
    deleted: vi.fn(),
  }
  const dependencies: CustomBlockModuleDependencies = {
    authentication: sessionAuthentication(),
    access: {
      workspacePermission: vi.fn(async (): Promise<'admin'> => 'admin'),
      organizationRole: vi.fn(async () => 'member'),
      workflow: vi.fn(async () => null),
    },
    repository,
    feature: { isEnabled: vi.fn(async () => true) },
    entitlement: { isEnterprise: vi.fn(async () => true) },
    platformAdmins: { isPlatformAdmin: vi.fn(async () => false) },
    visibility: {
      read: vi.fn(async () => ({
        revealed: ['preview'],
        disabled: ['disabled'],
        previewTagged: ['preview'],
      })),
    },
    audit,
    generateId: () => 'block-1',
    generateTypeSuffix: () => 'fixed',
    ...overrides,
  }
  return {
    module: createCustomBlockModule(dependencies),
    dependencies,
    repository,
    audit,
  }
}

async function handle(
  module: ReturnType<typeof createCustomBlockModule>,
  path: string,
  init: RequestInit = {}
) {
  return module.handle(
    new Request(`http://api.test${path}`, {
      ...init,
      headers: { cookie: 'session=valid', ...init.headers },
    }),
    { requestId: 'request-w5' }
  )
}

describe('W5 custom-block deep module', () => {
  beforeEach(() => vi.clearAllMocks())

  it('serves visibility after session and workspace-read authorization', async () => {
    const { module, dependencies } = setup()
    const response = await handle(module, '/api/blocks/visibility?workspaceId=workspace-1')
    expect(response?.status).toBe(200)
    expect(await response?.json()).toEqual({
      revealed: ['preview'],
      disabled: ['disabled'],
      previewTagged: ['preview'],
    })
    expect(dependencies.access.workspacePermission).toHaveBeenCalledWith('user-1', 'workspace-1')
    expect(response?.headers.get('x-sim-api-inventory-id')).toBe('API-0045')
  })

  it('lists the org projection only when feature and enterprise gates pass', async () => {
    const { module, repository } = setup()
    const response = await handle(module, '/api/custom-blocks?workspaceId=workspace-1')
    expect(await response?.json()).toEqual({ enabled: true, customBlocks: [block] })
    expect(repository.listWithInputs).toHaveBeenCalledWith('org-1')
  })

  it('keeps personal workspaces and disabled rollout empty without querying blocks', async () => {
    const personalRepository = setup().repository
    vi.mocked(personalRepository.findWorkspaceOrganization).mockResolvedValue(null)
    const personal = setup({ repository: personalRepository })
    expect(
      await (await handle(personal.module, '/api/custom-blocks?workspaceId=workspace-1'))?.json()
    ).toEqual({ enabled: false, customBlocks: [] })
    expect(personalRepository.listWithInputs).not.toHaveBeenCalled()

    const disabledRepository = setup().repository
    const disabled = setup({
      repository: disabledRepository,
      feature: { isEnabled: vi.fn(async () => false) },
    })
    expect(
      await (await handle(disabled.module, '/api/custom-blocks?workspaceId=workspace-1'))?.json()
    ).toEqual({ enabled: false, customBlocks: [] })
    expect(disabledRepository.listWithInputs).not.toHaveBeenCalled()
  })

  it('publishes after admin, feature, and plan checks and records the donor audit', async () => {
    const { module, repository, audit } = setup()
    const response = await handle(module, '/api/custom-blocks', {
      method: 'POST',
      body: JSON.stringify({
        workspaceId: 'workspace-1',
        workflowId: 'workflow-1',
        name: 'Child block',
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(response?.status).toBe(200)
    expect(repository.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'block-1',
        type: 'custom_block_fixed',
        organizationId: 'org-1',
        userId: 'user-1',
      })
    )
    expect(audit.published).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: 'block-1', workflowId: 'workflow-1' })
    )
  })

  it('updates, counts usages, and deletes behind source-workspace admin authorization', async () => {
    const { module, repository, audit } = setup()
    const update = await handle(module, '/api/custom-blocks/block-1', {
      method: 'PATCH',
      body: JSON.stringify({ enabled: false }),
      headers: { 'content-type': 'application/json' },
    })
    expect(await update?.json()).toEqual({ success: true })
    expect(repository.update).toHaveBeenCalledWith('block-1', 'org-1', { enabled: false })
    expect(audit.updated).toHaveBeenCalledOnce()

    const usages = await handle(module, '/api/custom-blocks/block-1/usages')
    expect(await usages?.json()).toEqual({ usageCount: 3, deployedUsageCount: 2 })

    const deletion = await handle(module, '/api/custom-blocks/block-1', { method: 'DELETE' })
    expect(await deletion?.json()).toEqual({ success: true })
    expect(repository.countUsages).toHaveBeenCalledBefore(vi.mocked(repository.delete))
    expect(audit.deleted).toHaveBeenCalledWith(
      expect.objectContaining({ usage: { usageCount: 3, deployedUsageCount: 2 } })
    )
  })

  it('uses the donor Unauthorized body and ignores unrelated credentials when session is valid', async () => {
    const { module, repository } = setup()
    const missing = await module.handle(
      new Request('http://api.test/api/custom-blocks?workspaceId='),
      { requestId: 'request-w5' }
    )
    expect(missing?.status).toBe(401)
    expect(await missing?.json()).toEqual({ error: 'Unauthorized' })
    expect(repository.findWorkspaceOrganization).not.toHaveBeenCalled()

    const invalidSession = await module.handle(
      new Request('http://api.test/api/custom-blocks?workspaceId=workspace-1', {
        headers: { cookie: 'session=invalid' },
      }),
      { requestId: 'request-w5' }
    )
    expect(invalidSession?.status).toBe(401)
    expect(await invalidSession?.json()).toEqual({ error: 'Unauthorized' })

    const apiKey = await module.handle(
      new Request('http://api.test/api/custom-blocks?workspaceId=workspace-1', {
        headers: { 'x-api-key': 'valid' },
      }),
      { requestId: 'request-w5' }
    )
    expect(apiKey?.status).toBe(401)
    expect(await apiKey?.json()).toEqual({ error: 'Unauthorized' })

    const mixed = await handle(module, '/api/custom-blocks?workspaceId=workspace-1', {
      headers: {
        'x-api-key': 'unrelated',
        authorization: 'Bearer unrelated',
      },
    })
    expect(mixed?.status).toBe(200)
    expect(await mixed?.json()).toEqual({ enabled: true, customBlocks: [block] })
  })

  it('returns donor validation details after authentication', async () => {
    const { module, repository } = setup()
    const duplicate = await handle(
      module,
      '/api/custom-blocks?workspaceId=workspace-1&workspaceId=workspace-2'
    )
    expect(duplicate?.status).toBe(400)
    expect(await duplicate?.json()).toMatchObject({
      error: 'Validation error',
      details: [expect.objectContaining({ path: ['workspaceId'] })],
    })
    expect(repository.findWorkspaceOrganization).not.toHaveBeenCalled()

    const invalidPath = await handle(module, '/api/custom-blocks/%E0%A4%A', {
      method: 'DELETE',
    })
    expect(invalidPath?.status).toBe(400)
    expect(await invalidPath?.json()).toEqual({
      error: 'Validation error',
      details: [
        {
          code: 'custom',
          path: ['id'],
          message: 'Invalid URL-encoded path parameter',
        },
      ],
    })

    const invalidPublish = await handle(module, '/api/custom-blocks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        workspaceId: 'workspace-1',
        workflowId: 'workflow-1',
        name: '',
      }),
    })
    expect(invalidPublish?.status).toBe(400)
    expect(await invalidPublish?.json()).toMatchObject({
      error: 'Validation error',
      details: [expect.objectContaining({ path: ['name'], message: 'Name is required' })],
    })

    const invalidUpdate = await handle(module, '/api/custom-blocks/block-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    expect(invalidUpdate?.status).toBe(400)
    expect(await invalidUpdate?.json()).toMatchObject({
      error: 'Validation error',
      details: [expect.objectContaining({ message: 'At least one field is required' })],
    })
  })

  it('strips additive publish/update fields and preserves invalid-JSON wire behavior', async () => {
    const { module, repository } = setup()
    const published = await handle(module, '/api/custom-blocks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        workspaceId: 'workspace-1',
        workflowId: 'workflow-1',
        name: 'Child block',
        additive: 'ignored',
        inputs: [{ id: 'city', required: true, additive: 'ignored' }],
      }),
    })
    expect(published?.status).toBe(200)
    expect(repository.publish).toHaveBeenCalledWith(
      expect.not.objectContaining({ additive: expect.anything() })
    )
    expect(repository.publish).toHaveBeenCalledWith(
      expect.objectContaining({ inputs: [{ id: 'city', required: true }] })
    )

    const updated = await handle(module, '/api/custom-blocks/block-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: false, additive: 'ignored' }),
    })
    expect(updated?.status).toBe(200)
    expect(repository.update).toHaveBeenLastCalledWith('block-1', 'org-1', { enabled: false })

    const invalidJson = await handle(module, '/api/custom-blocks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    })
    expect(invalidJson?.status).toBe(400)
    expect(await invalidJson?.json()).toEqual({ error: 'Request body must be valid JSON' })
  })

  it('preserves not-found, feature-disabled, and source-admin precedence for manage routes', async () => {
    const missingRepository = setup().repository
    vi.mocked(missingRepository.findManageContext).mockResolvedValue(null)
    const missing = setup({ repository: missingRepository })
    expect(
      (await handle(missing.module, '/api/custom-blocks/missing', { method: 'DELETE' }))?.status
    ).toBe(404)

    const feature = setup({ feature: { isEnabled: vi.fn(async () => false) } })
    expect(
      (await handle(feature.module, '/api/custom-blocks/block-1', { method: 'DELETE' }))?.status
    ).toBe(403)

    const denied = setup({
      access: {
        workspacePermission: vi.fn(async (): Promise<'write'> => 'write'),
        organizationRole: vi.fn(async () => 'member'),
        workflow: vi.fn(async () => null),
      },
    })
    const deniedResponse = await handle(denied.module, '/api/custom-blocks/block-1', {
      method: 'DELETE',
    })
    expect(deniedResponse?.status).toBe(403)
    expect(await deniedResponse?.json()).toEqual({ error: 'Admin permissions required' })

    const raceRepository = setup().repository
    vi.mocked(raceRepository.update).mockResolvedValue(false)
    vi.mocked(raceRepository.delete).mockResolvedValue(false)
    const race = setup({ repository: raceRepository })
    const racedUpdate = await handle(race.module, '/api/custom-blocks/block-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    })
    expect(racedUpdate?.status).toBe(404)
    expect(race.audit.updated).not.toHaveBeenCalled()
    const racedDelete = await handle(race.module, '/api/custom-blocks/block-1', {
      method: 'DELETE',
    })
    expect(racedDelete?.status).toBe(404)
    expect(race.audit.deleted).not.toHaveBeenCalled()
  })

  it('includes donor HEAD/OPTIONS values and complete method fallthrough behavior', async () => {
    const { module } = setup()
    const head = await handle(module, '/api/custom-blocks?workspaceId=workspace-1', {
      method: 'HEAD',
    })
    expect(head?.status).toBe(200)
    expect(await head?.text()).toBe('')

    const options = await handle(module, '/api/custom-blocks', { method: 'OPTIONS' })
    expect(options?.status).toBe(204)
    expect(options?.headers.get('allow')).toBe('GET, HEAD, OPTIONS, POST')

    for (const [path, allow] of [
      ['/api/blocks/visibility', 'GET, HEAD, OPTIONS'],
      ['/api/custom-blocks/block-1/usages', 'GET, HEAD, OPTIONS'],
      ['/api/custom-blocks/block-1', 'DELETE, OPTIONS, PATCH'],
    ] as const) {
      const response = await handle(module, path, { method: 'OPTIONS' })
      expect(response?.status).toBe(204)
      expect(response?.headers.get('allow')).toBe(allow)
    }

    for (const [path, invalidMethods] of [
      ['/api/blocks/visibility', ['POST', 'PUT', 'DELETE', 'PATCH']],
      ['/api/custom-blocks', ['PUT', 'DELETE', 'PATCH']],
      ['/api/custom-blocks/block-1/usages', ['POST', 'PUT', 'DELETE', 'PATCH']],
      ['/api/custom-blocks/block-1', ['GET', 'HEAD', 'POST', 'PUT']],
    ] as const) {
      for (const method of invalidMethods) {
        const invalid = await handle(module, path, { method })
        expect(invalid?.status).toBe(405)
        expect(invalid?.headers.get('allow')).toBeNull()
      }
    }

    expect(await handle(module, '/api/unrelated')).toBeUndefined()
  })

  it('adds requestId to unexpected repository, policy, and audit failures', async () => {
    const repositoryFailure = setup().repository
    vi.mocked(repositoryFailure.listWithInputs).mockRejectedValue(new Error('database failed'))
    const repositoryCase = setup({ repository: repositoryFailure })
    const repositoryResponse = await handle(
      repositoryCase.module,
      '/api/custom-blocks?workspaceId=workspace-1'
    )
    expect(repositoryResponse?.status).toBe(500)
    expect(await repositoryResponse?.json()).toEqual({
      error: 'Internal server error',
      requestId: 'request-w5',
    })

    const policyCase = setup({
      feature: {
        isEnabled: vi.fn(async () => {
          throw new Error('policy failed')
        }),
      },
    })
    const policyResponse = await handle(
      policyCase.module,
      '/api/custom-blocks?workspaceId=workspace-1'
    )
    expect(policyResponse?.status).toBe(500)
    expect(await policyResponse?.json()).toEqual({
      error: 'Internal server error',
      requestId: 'request-w5',
    })

    const auditCase = setup({
      audit: {
        published: vi.fn(() => {
          throw new Error('audit failed')
        }),
        updated: vi.fn(),
        deleted: vi.fn(),
      },
    })
    const auditResponse = await handle(auditCase.module, '/api/custom-blocks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        workspaceId: 'workspace-1',
        workflowId: 'workflow-1',
        name: 'Child block',
      }),
    })
    expect(auditResponse?.status).toBe(500)
    expect(await auditResponse?.json()).toEqual({
      error: 'Internal server error',
      requestId: 'request-w5',
    })
  })
})

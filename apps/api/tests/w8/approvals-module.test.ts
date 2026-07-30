import type {
  ApprovalDefinitionSpecV1,
  ApprovalDefinitionV1,
  ApprovalV1,
} from '@sim/api-contracts/approvals'
import { createRequestAuthenticator } from '@sim/auth/request-context'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type ApprovalsModuleDependencies, createApprovalsModule } from '@/modules/approvals'

const spec: ApprovalDefinitionSpecV1 = {
  nodes: [
    { id: 'start', type: 'start' },
    {
      id: 'review',
      type: 'approval',
      name: 'Review',
      mode: 'any',
      candidates: [{ kind: 'user', userId: 'user-1' }],
      isDecision: true,
    },
    { id: 'end', type: 'end' },
  ],
  edges: [
    { from: 'start', to: 'review' },
    { from: 'review', to: 'end', condition: 'approve' },
  ],
}

const approval: ApprovalV1 = {
  id: 'approval-1',
  workspaceId: 'workspace-1',
  workflowId: 'workflow-1',
  definitionVersionId: 'version-1',
  executionId: 'execution-1',
  contextId: 'context-1',
  businessType: 'workflow',
  businessId: 'project-1',
  title: 'Approve release',
  content: 'Release details',
  mode: 'any',
  status: 'pending',
  resumeStatus: 'pending',
  resumeExecutionId: null,
  resumeError: null,
  state: {},
  versionNo: 0,
  requestedBy: 'user-2',
  decidedAt: null,
  createdAt: '2026-07-30T00:00:00.000Z',
  updatedAt: '2026-07-30T00:00:00.000Z',
  tasks: [
    {
      id: 'task-1',
      stepInstanceId: 'step-1',
      channel: 'feishu',
      receiveIdType: 'user_id',
      reviewerExternalId: 'user-1',
      reviewerUserId: 'user-1',
      reviewerRoleCode: null,
      canAct: true,
      status: 'pending',
      messageId: null,
      decidedByExternalId: null,
      decidedAt: null,
    },
  ],
  decisions: [],
}

const definition: ApprovalDefinitionV1 = {
  id: 'definition-1',
  workspaceId: 'workspace-1',
  code: 'release',
  name: 'Release',
  description: null,
  enabled: true,
  createdAt: '2026-07-30T00:00:00.000Z',
  updatedAt: '2026-07-30T00:00:00.000Z',
  versions: [
    {
      id: 'version-1',
      definitionId: 'definition-1',
      version: 1,
      status: 'draft',
      spec,
      publishedAt: null,
      createdAt: '2026-07-30T00:00:00.000Z',
      updatedAt: '2026-07-30T00:00:00.000Z',
    },
  ],
}

function authentication() {
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
                  name: 'Reviewer',
                  email: 'reviewer@example.com',
                },
                sessionId: 'session-1',
                activeOrganizationId: 'org-1',
              },
            }
          : { verified: false as const, reason: 'invalid' as const }
      },
    },
  })
}

function setup(overrides: Partial<ApprovalsModuleDependencies> = {}) {
  const repository: ApprovalsModuleDependencies['repository'] = {
    listDefinitions: vi.fn(async () => [definition]),
    getDefinitionWorkspace: vi.fn(async () => 'workspace-1'),
    createDefinition: vi.fn(async () => definition),
    createVersion: vi.fn(async () => definition.versions[0]!),
    publishVersion: vi.fn(async () => ({
      ...definition.versions[0]!,
      status: 'published' as const,
      publishedAt: '2026-07-30T00:01:00.000Z',
    })),
    listApprovals: vi.fn(async () => [approval]),
    getApproval: vi.fn(async () => approval),
    start: vi.fn(async () => approval),
    decide: vi.fn(async () => ({
      status: 'terminal' as const,
      approvalStatus: 'approved' as const,
      approvalId: approval.id,
      shouldResume: true,
    })),
    claimResume: vi.fn(async () => ({
      approvalId: approval.id,
      workflowId: approval.workflowId,
      executionId: approval.executionId,
      contextId: approval.contextId,
      approvalStatus: 'approved' as const,
      recoveredStalledClaim: false,
    })),
    markResumeStarted: vi.fn(async () => undefined),
    markResumeFailed: vi.fn(async () => undefined),
  }
  const dependencies: ApprovalsModuleDependencies = {
    authentication: authentication(),
    access: {
      workspace: vi.fn(async () => ({
        organizationId: 'org-1',
        organizationRole: 'owner',
        permission: 'admin' as const,
      })),
      hasBusinessCapability: vi.fn(async () => true),
      filterVisibleApprovals: vi.fn(async ({ approvals }) => approvals),
    },
    repository,
    resume: {
      run: vi.fn(async () => ({
        status: 'resuming' as const,
        resumeExecutionId: 'execution-1',
      })),
    },
    effects: {
      approvalStarted: vi.fn(async () => undefined),
      approvalDecided: vi.fn(async () => undefined),
    },
    audit: {
      record: vi.fn(async () => undefined),
      list: vi.fn(async () => ({ logs: [], apiEvents: [] })),
    },
    ...overrides,
  }
  return {
    module: createApprovalsModule(dependencies),
    dependencies,
    repository,
  }
}

async function handle(
  module: ReturnType<typeof createApprovalsModule>,
  path: string,
  init: RequestInit = {},
  authenticated = true
) {
  return module.handle(
    new Request(`http://api.test${path}`, {
      ...init,
      headers: {
        ...(authenticated ? { cookie: 'session=valid' } : {}),
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
      },
    }),
    { requestId: 'request-w8' }
  )
}

describe('W8 approval deep module', () => {
  beforeEach(() => vi.clearAllMocks())

  it('authenticates before parsing untrusted request bodies', async () => {
    const { module, repository } = setup()
    const response = await handle(
      module,
      '/api/approvals/start',
      { method: 'POST', body: '{' },
      false
    )
    expect(response?.status).toBe(401)
    expect(repository.start).not.toHaveBeenCalled()
  })

  it('covers all eight inventory routes through the same deep interface', async () => {
    const { module } = setup()
    const routes: Array<[string, RequestInit, string, number]> = [
      [
        '/api/approvals/approval-1/decisions',
        {
          method: 'POST',
          body: JSON.stringify({ taskId: 'task-1', action: 'approve' }),
        },
        'API-0002',
        200,
      ],
      [
        '/api/approvals/approval-1/resume',
        { method: 'POST', body: JSON.stringify({ reason: 'operator retry' }) },
        'API-0003',
        200,
      ],
      ['/api/approvals/audit-logs?workspaceId=workspace-1', {}, 'API-0004', 200],
      [
        '/api/approvals/definitions/definition-1/versions/version-1/publish',
        { method: 'POST' },
        'API-0005',
        200,
      ],
      [
        '/api/approvals/definitions/definition-1/versions',
        { method: 'POST', body: JSON.stringify({ spec }) },
        'API-0006',
        201,
      ],
      ['/api/approvals/definitions?workspaceId=workspace-1', {}, 'API-0007', 200],
      ['/api/approvals?workspaceId=workspace-1', {}, 'API-0009', 200],
      [
        '/api/approvals/start',
        {
          method: 'POST',
          body: JSON.stringify({
            workspaceId: 'workspace-1',
            workflowId: 'workflow-1',
            executionId: 'execution-1',
            contextId: 'context-1',
            definitionVersionId: 'version-1',
            title: 'Approve release',
            content: 'Release details',
          }),
        },
        'API-0010',
        201,
      ],
    ]
    for (const [path, init, inventoryId, status] of routes) {
      const response = await handle(module, path, init)
      expect(response?.status, `${inventoryId} status`).toBe(status)
      expect(response?.headers.get('x-sim-api-inventory-id')).toBe(inventoryId)
    }
  })

  it('enforces organization business capabilities and row filtering for non-admins', async () => {
    const base = setup()
    const hasBusinessCapability = vi.fn(async () => true)
    const filterVisibleApprovals = vi.fn(async () => [{ ...approval, content: '[restricted]' }])
    const { module } = setup({
      ...base.dependencies,
      access: {
        workspace: vi.fn(
          async () =>
            ({
              organizationId: 'org-1',
              organizationRole: 'member',
              permission: 'read',
            }) as const
        ),
        hasBusinessCapability,
        filterVisibleApprovals,
      },
    })
    const response = await handle(module, '/api/approvals?workspaceId=workspace-1')
    expect(response?.status).toBe(200)
    expect(hasBusinessCapability).toHaveBeenCalledWith(
      expect.objectContaining({
        menuCode: 'approvals',
        permissionCode: 'pm.approval.read',
      })
    )
    expect(filterVisibleApprovals).toHaveBeenCalled()
    if (!response) {
      throw new Error('Expected approvals response')
    }
    expect((await response.json()).approvals[0].content).toBe('[restricted]')
  })

  it('fails closed when approval menu or permission is missing', async () => {
    const base = setup()
    const { module } = setup({
      ...base.dependencies,
      access: {
        workspace: vi.fn(
          async () =>
            ({
              organizationId: 'org-1',
              organizationRole: 'member',
              permission: 'read',
            }) as const
        ),
        hasBusinessCapability: vi.fn(async () => false),
        filterVisibleApprovals: vi.fn(async ({ approvals }) => approvals),
      },
    })
    expect((await handle(module, '/api/approvals?workspaceId=workspace-1'))?.status).toBe(403)
    expect(
      (await handle(module, '/api/approvals/audit-logs?workspaceId=workspace-1'))?.status
    ).toBe(403)
  })

  it('resumes terminal decisions through Worker and records audit/effects', async () => {
    const { module, dependencies, repository } = setup()
    const response = await handle(module, '/api/approvals/approval-1/decisions', {
      method: 'POST',
      body: JSON.stringify({ taskId: 'task-1', action: 'approve' }),
    })
    expect(await response?.json()).toEqual({
      status: 'resuming',
      approvalStatus: 'approved',
      approvalId: 'approval-1',
      resumeExecutionId: 'execution-1',
    })
    expect(dependencies.resume.run).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalId: 'approval-1',
        contextId: 'context-1',
      })
    )
    expect(repository.markResumeStarted).toHaveBeenCalled()
    expect(dependencies.effects.approvalDecided).toHaveBeenCalled()
    expect(dependencies.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'APPROVAL_APPROVE' })
    )
  })

  it('requires workspace admin for definition mutations', async () => {
    const base = setup()
    const { module, repository } = setup({
      ...base.dependencies,
      access: {
        ...base.dependencies.access,
        workspace: vi.fn(
          async () =>
            ({
              organizationId: 'org-1',
              organizationRole: 'member',
              permission: 'write',
            }) as const
        ),
      },
    })
    const response = await handle(module, '/api/approvals/definitions', {
      method: 'POST',
      body: JSON.stringify({
        workspaceId: 'workspace-1',
        code: 'release',
        name: 'Release',
        spec,
      }),
    })
    expect(response?.status).toBe(403)
    expect(repository.createDefinition).not.toHaveBeenCalled()
  })
})

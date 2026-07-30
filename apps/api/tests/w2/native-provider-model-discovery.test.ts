import type { ProviderModelDiscoveryProviderV1 } from '@sim/api-contracts/provider-model-discovery'
import { providerModelsResponseV1Schema } from '@sim/api-contracts/provider-model-discovery'
import { createRequestAuthenticator } from '@sim/auth/request-context'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApiApplication } from '@/bootstrap/application/create-api-application'
import { createProductionApiOptions } from '@/bootstrap/composition/create-production-api-options'
import {
  createDiscoverProviderModelsUseCase,
  createProviderModelDiscoveryModule,
  type ProviderModelDiscoveryRuntimeConfig,
} from '@/modules/provider-model-discovery'
import type { BaseProviderModelCatalog } from '@/modules/provider-model-discovery/ports/base-provider-model-catalog'
import type { ProviderModelCredentialReader } from '@/modules/provider-model-discovery/ports/provider-model-credential-reader'
import type { ProviderModelSource } from '@/modules/provider-model-discovery/ports/provider-model-source'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const upstream: Record<Exclude<ProviderModelDiscoveryProviderV1, 'base'>, unknown> = {
  baseten: { data: [{ id: 'model-a' }, { id: 'model-a' }] },
  fireworks: { data: [{ id: 'model-a' }, { id: 'model-a' }] },
  litellm: { data: [{ id: 'model-a' }, { id: 'model-a' }] },
  'ollama-cloud': { models: [{ name: 'model-a' }, { name: 'model-a' }] },
  ollama: { models: [{ name: 'model-a' }, { name: 'model-a' }] },
  openrouter: {
    data: [
      {
        context_length: 128_000,
        id: 'model-a',
        pricing: { completion: '0.000002', prompt: '0.000001' },
        supported_parameters: ['structured_outputs', 'tools'],
      },
      { id: 'blocked-info' },
    ],
  },
  together: [
    { id: 'chat-a', type: 'chat' },
    { id: 'image-a', type: 'image' },
    { id: 'chat-a', type: 'chat' },
  ],
  vllm: { data: [{ id: 'model-a' }, { id: 'model-a' }] },
}

function baseCatalog(
  entries: readonly { id: string; provider: string }[] = [
    { id: 'GPT-A', provider: 'openai' },
    { id: 'claude-a', provider: 'anthropic' },
  ]
): BaseProviderModelCatalog {
  return { list: vi.fn(() => entries) }
}

function source(): ProviderModelSource {
  return {
    read: vi.fn<ProviderModelSource['read']>(async ({ provider }) => upstream[provider]),
  }
}

function credentials(value: string | null = 'byok-secret'): ProviderModelCredentialReader {
  return { readAuthorized: vi.fn(async () => value) }
}

function useCase(
  options: {
    baseCatalog?: BaseProviderModelCatalog
    credentials?: ProviderModelCredentialReader
    runtime?: ProviderModelDiscoveryRuntimeConfig
    source?: ProviderModelSource
  } = {}
) {
  return createDiscoverProviderModelsUseCase({
    baseCatalog: options.baseCatalog ?? baseCatalog(),
    credentials: options.credentials ?? credentials(),
    runtime: {
      basetenApiKey: 'env-baseten',
      fireworksApiKey: 'env-fireworks',
      togetherApiKey: 'env-together',
      ...options.runtime,
    },
    source: options.source ?? source(),
  })
}

async function execute(
  provider: ProviderModelDiscoveryProviderV1,
  options: {
    rawWorkspaceId?: string
    resolveSessionActorId?: () => Promise<string | undefined>
    useCase?: ReturnType<typeof useCase>
  } = {}
) {
  return (options.useCase ?? useCase()).execute({
    provider,
    ...(options.rawWorkspaceId !== undefined ? { rawWorkspaceId: options.rawWorkspaceId } : {}),
    resolveSessionActorId: options.resolveSessionActorId ?? (async () => undefined),
  })
}

describe('native provider model discovery', () => {
  it('projects all nine donor wire formats with exact dedupe and type filtering', async () => {
    const discover = useCase({
      runtime: { blacklistedModels: 'openrouter/blocked*' },
    })
    const expected: Record<ProviderModelDiscoveryProviderV1, string[]> = {
      base: ['gpt-a', 'claude-a'],
      baseten: ['baseten/model-a'],
      fireworks: ['fireworks/model-a'],
      litellm: ['litellm/model-a', 'litellm/model-a'],
      'ollama-cloud': ['ollama-cloud/model-a'],
      ollama: ['model-a', 'model-a'],
      openrouter: ['openrouter/model-a'],
      together: ['together/chat-a'],
      vllm: ['vllm/model-a', 'vllm/model-a'],
    }

    for (const provider of Object.keys(expected) as ProviderModelDiscoveryProviderV1[]) {
      const result = await execute(provider, {
        ...(provider === 'ollama-cloud'
          ? {
              rawWorkspaceId: 'workspace-1',
              resolveSessionActorId: async () => 'user-1',
            }
          : {}),
        useCase: discover,
      })
      expect(result.status).toBe(200)
      expect(providerModelsResponseV1Schema.parse(result.body)).toEqual(result.body)
      expect('models' in result.body ? result.body.models : []).toEqual(expected[provider])
    }

    const openrouter = await execute('openrouter', { useCase: discover })
    expect(openrouter.body).toMatchObject({
      modelInfo: {
        'openrouter/model-a': {
          contextLength: 128_000,
          id: 'openrouter/model-a',
          pricing: { input: 1, output: 2 },
          supportsStructuredOutputs: true,
          supportsTools: true,
        },
        'openrouter/blocked-info': {
          id: 'openrouter/blocked-info',
        },
      },
    })
  })

  it('checks provider blacklist before query validation, authentication, credentials, or HTTP', async () => {
    const remote = source()
    const credentialReader = credentials()
    const resolveActor = vi.fn(async () => 'user-1')
    const result = await execute('together', {
      rawWorkspaceId: '',
      resolveSessionActorId: resolveActor,
      useCase: useCase({
        credentials: credentialReader,
        runtime: {
          blacklistedProviders: ' TOGETHER ',
          togetherApiKey: 'env-secret',
        },
        source: remote,
      }),
    })

    expect(result).toEqual({ body: { models: [] }, ok: true, status: 200 })
    expect(resolveActor).not.toHaveBeenCalled()
    expect(credentialReader.readAuthorized).not.toHaveBeenCalled()
    expect(remote.read).not.toHaveBeenCalled()
  })

  it('preserves the donor base-catalog last-provider-wins ownership rule', async () => {
    const result = await execute('base', {
      useCase: useCase({
        baseCatalog: baseCatalog([
          { id: 'shared-hidden', provider: 'allowed-first' },
          { id: 'shared-visible', provider: 'blocked-first' },
          { id: 'SHARED-HIDDEN', provider: 'blocked-last' },
          { id: 'SHARED-VISIBLE', provider: 'allowed-last' },
        ]),
        runtime: { blacklistedProviders: 'blocked-first,blocked-last' },
      }),
    })

    expect(result).toEqual({
      body: { models: ['shared-visible'] },
      ok: true,
      status: 200,
    })
  })

  it('validates workspaceId before optional session resolution', async () => {
    const resolveActor = vi.fn(async () => 'user-1')
    const result = await execute('baseten', {
      rawWorkspaceId: '',
      resolveSessionActorId: resolveActor,
    })

    expect(result.status).toBe(400)
    expect(result.body).toMatchObject({ error: 'Validation error' })
    expect(resolveActor).not.toHaveBeenCalled()
  })

  it('prefers authorized BYOK, falls back to env anonymously, and keeps Ollama Cloud BYOK-only', async () => {
    const remote = source()
    const credentialReader = credentials('byok-must-not-leak')
    const discover = useCase({
      credentials: credentialReader,
      source: remote,
    })

    const byok = await execute('baseten', {
      rawWorkspaceId: 'workspace-1',
      resolveSessionActorId: async () => 'user-1',
      useCase: discover,
    })
    expect(byok.status).toBe(200)
    expect(credentialReader.readAuthorized).toHaveBeenCalledWith({
      actorId: 'user-1',
      provider: 'baseten',
      workspaceId: 'workspace-1',
    })
    expect(remote.read).toHaveBeenLastCalledWith({
      apiKey: 'byok-must-not-leak',
      provider: 'baseten',
    })
    expect(JSON.stringify(byok.body)).not.toContain('must-not-leak')

    await execute('fireworks', {
      rawWorkspaceId: 'workspace-1',
      resolveSessionActorId: async () => undefined,
      useCase: discover,
    })
    expect(remote.read).toHaveBeenLastCalledWith({
      apiKey: 'env-fireworks',
      provider: 'fireworks',
    })

    const cloud = await execute('ollama-cloud', {
      rawWorkspaceId: 'workspace-1',
      resolveSessionActorId: async () => undefined,
      useCase: discover,
    })
    expect(cloud).toEqual({ body: { models: [] }, ok: true, status: 200 })
  })

  it('folds non-success, malformed, and missing-config upstreams to donor-compatible empty wires', async () => {
    const nullSource: ProviderModelSource = { read: vi.fn(async () => null) }
    expect(
      (await execute('openrouter', { useCase: useCase({ source: nullSource }) })).body
    ).toEqual({
      modelInfo: {},
      models: [],
    })
    expect(
      (
        await execute('vllm', {
          useCase: useCase({
            runtime: {},
            source: nullSource,
          }),
        })
      ).body
    ).toEqual({ models: [] })

    const malformed: ProviderModelSource = {
      read: vi.fn(async () => ({ credentials: 'must-not-leak', wrong: true })),
    }
    expect((await execute('openrouter', { useCase: useCase({ source: malformed }) })).body).toEqual(
      { modelInfo: {}, models: [] }
    )
  })

  it('preserves the base-only 500 response when the generated catalog fails', async () => {
    const result = await execute('base', {
      useCase: useCase({
        baseCatalog: {
          list() {
            throw new Error('catalog unavailable')
          },
        },
      }),
    })
    expect(result).toEqual({
      body: { error: 'Failed to fetch models', models: [] },
      ok: false,
      status: 500,
    })
  })

  it('routes all nine paths natively and only enriches workspace-aware calls with an optional session', async () => {
    const authenticate = vi.fn()
    const authentication = createRequestAuthenticator({
      sessions: {
        async verify(headers) {
          authenticate(headers)
          return headers.get('cookie') === 'session=valid'
            ? {
                credential: {
                  activeOrganizationId: null,
                  actor: { id: 'user-1', type: 'user' as const },
                  sessionId: 'session-1',
                },
                verified: true as const,
              }
            : { reason: 'invalid', verified: false as const }
        },
      },
    })
    const credentialReader = credentials()
    const module = createProviderModelDiscoveryModule({
      authentication,
      discover: useCase({ credentials: credentialReader }),
    })
    const application = createApiApplication({ providerModelDiscovery: module })
    const paths = [
      ['API-0270', '/api/providers/base/models'],
      ['API-0271', '/api/providers/baseten/models'],
      ['API-0272', '/api/providers/fireworks/models'],
      ['API-0273', '/api/providers/litellm/models'],
      ['API-0274', '/api/providers/ollama-cloud/models'],
      ['API-0275', '/api/providers/ollama/models'],
      ['API-0276', '/api/providers/openrouter/models'],
      ['API-0278', '/api/providers/together/models'],
      ['API-0279', '/api/providers/vllm/models'],
    ] as const

    for (const [inventoryId, path] of paths) {
      const workspaceAware = ['API-0271', 'API-0272', 'API-0274', 'API-0278'].includes(inventoryId)
      const response = await application.handle(
        new Request(`http://api.test${path}${workspaceAware ? '?workspaceId=workspace-1' : ''}`, {
          headers: { cookie: 'session=valid', 'x-request-id': `request-${inventoryId}` },
        })
      )
      expect(response.status).toBe(200)
      expect(response.headers.get('x-sim-api-inventory-id')).toBe(inventoryId)
      expect(response.headers.get('x-sim-api-module')).toBe('provider-model-discovery')
      expect(response.headers.get('x-sim-api-backend')).toBe('native')
    }
    expect(authenticate).toHaveBeenCalledTimes(4)
    expect(credentialReader.readAuthorized).toHaveBeenCalledTimes(4)
  })

  it('matches the Next GET, HEAD, OPTIONS, 405, and unrelated 404 method matrix', async () => {
    const authenticate = vi.fn()
    const authentication = createRequestAuthenticator({
      sessions: {
        async verify(headers) {
          authenticate(headers)
          return {
            credential: {
              activeOrganizationId: null,
              actor: { id: 'user-1', type: 'user' as const },
              sessionId: 'session-1',
            },
            verified: true as const,
          }
        },
      },
    })
    const credentialReader = credentials()
    const discover = useCase({ credentials: credentialReader })
    const executeSpy = vi.spyOn(discover, 'execute')
    const application = createApiApplication({
      providerModelDiscovery: createProviderModelDiscoveryModule({
        authentication,
        discover,
      }),
    })

    const get = await application.handle(new Request('http://api.test/api/providers/base/models'))
    expect(get.status).toBe(200)
    expect(get.headers.get('x-sim-api-inventory-id')).toBe('API-0270')

    const head = await application.handle(
      new Request('http://api.test/api/providers/baseten/models?workspaceId=workspace-1', {
        headers: { cookie: 'session=valid' },
        method: 'HEAD',
      })
    )
    expect(head.status).toBe(200)
    expect(await head.text()).toBe('')
    expect(head.headers.get('x-sim-api-inventory-id')).toBe('API-0271')
    expect(authenticate).toHaveBeenCalledOnce()
    expect(credentialReader.readAuthorized).toHaveBeenCalledWith({
      actorId: 'user-1',
      provider: 'baseten',
      workspaceId: 'workspace-1',
    })

    const executedAfterGetAndHead = executeSpy.mock.calls.length
    const options = await application.handle(
      new Request('http://api.test/api/providers/base/models', { method: 'OPTIONS' })
    )
    expect(options.status).toBe(204)
    expect(options.headers.get('allow')).toBe('GET, HEAD, OPTIONS')
    expect(await options.text()).toBe('')
    expect(options.headers.get('x-sim-api-inventory-id')).toBe('API-0270')
    expect(executeSpy).toHaveBeenCalledTimes(executedAfterGetAndHead)

    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const wrongMethod = await application.handle(
        new Request('http://api.test/api/providers/base/models', { method })
      )
      expect(wrongMethod.status).toBe(405)
      expect(wrongMethod.headers.get('allow')).toBeNull()
      expect(await wrongMethod.text()).toBe('')
      expect(wrongMethod.headers.get('x-sim-api-inventory-id')).toBe('API-0270')

      const unrelated = await application.handle(
        new Request('http://api.test/api/providers/not-a-provider/models', { method })
      )
      expect(unrelated.status).toBe(404)
      expect(unrelated.headers.get('allow')).toBeNull()
      expect(unrelated.headers.get('x-sim-api-inventory-id')).toBeNull()
    }
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      const unrelated = await application.handle(
        new Request('http://api.test/api/providers/not-a-provider/models', { method })
      )
      expect(unrelated.status).toBe(404)
      expect(unrelated.headers.get('allow')).toBeNull()
      expect(unrelated.headers.get('x-sim-api-inventory-id')).toBeNull()
    }
    expect(executeSpy).toHaveBeenCalledTimes(executedAfterGetAndHead)
  })

  it('treats an invalid optional session as anonymous and falls back to the environment key', async () => {
    const remote = source()
    const credentialReader = credentials()
    const authentication = createRequestAuthenticator({
      sessions: {
        async verify() {
          return { reason: 'invalid', verified: false as const }
        },
      },
    })
    const application = createApiApplication({
      providerModelDiscovery: createProviderModelDiscoveryModule({
        authentication,
        discover: useCase({
          credentials: credentialReader,
          runtime: { basetenApiKey: 'env-baseten' },
          source: remote,
        }),
      }),
    })

    const response = await application.handle(
      new Request('http://api.test/api/providers/baseten/models?workspaceId=workspace-1', {
        headers: { cookie: 'session=invalid' },
      })
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ models: ['baseten/model-a'] })
    expect(credentialReader.readAuthorized).not.toHaveBeenCalled()
    expect(remote.read).toHaveBeenCalledWith({
      apiKey: 'env-baseten',
      provider: 'baseten',
      signal: expect.any(AbortSignal),
    })
  })

  it('falls back to the environment key when an authenticated actor has no authorized BYOK', async () => {
    const remote = source()
    const credentialReader = credentials(null)
    const authentication = createRequestAuthenticator({
      sessions: {
        async verify() {
          return {
            credential: {
              activeOrganizationId: null,
              actor: { id: 'actor-denied', type: 'user' as const },
              sessionId: 'session-denied',
            },
            verified: true as const,
          }
        },
      },
    })
    const application = createApiApplication({
      providerModelDiscovery: createProviderModelDiscoveryModule({
        authentication,
        discover: useCase({
          credentials: credentialReader,
          runtime: { basetenApiKey: 'env-baseten' },
          source: remote,
        }),
      }),
    })

    const response = await application.handle(
      new Request('http://api.test/api/providers/baseten/models?workspaceId=workspace-1', {
        headers: { cookie: 'session=valid' },
      })
    )

    expect(response.status).toBe(200)
    expect(credentialReader.readAuthorized).toHaveBeenCalledWith({
      actorId: 'actor-denied',
      provider: 'baseten',
      workspaceId: 'workspace-1',
    })
    expect(remote.read).toHaveBeenCalledWith({
      apiKey: 'env-baseten',
      provider: 'baseten',
      signal: expect.any(AbortSignal),
    })
  })

  it.each([
    ['OLLAMA_URL', 'ftp://must-not-be-read', '/api/providers/ollama/models'],
    ['LITELLM_BASE_URL', 'not a valid URL', '/api/providers/litellm/models'],
    ['VLLM_BASE_URL', 'file:///must-not-be-read', '/api/providers/vllm/models'],
  ] as const)(
    'keeps production composition live and isolates invalid %s configuration',
    async (environmentName, invalidUrl, providerPath) => {
      for (const name of [
        'DATABASE_URL',
        'BETTER_AUTH_SECRET',
        'BETTER_AUTH_URL',
        'NEXT_PUBLIC_APP_URL',
        'ENCRYPTION_KEY',
        'SIM_LEGACY_API_BASE_URL',
        'WORKER_ADMISSION_URL',
        'INTERNAL_EXECUTION_TOKEN',
        'OLLAMA_URL',
        'LITELLM_BASE_URL',
        'VLLM_BASE_URL',
      ]) {
        vi.stubEnv(name, '')
      }
      vi.stubEnv(environmentName, invalidUrl)
      const fetcher = vi.fn()
      vi.stubGlobal('fetch', fetcher)

      const application = createApiApplication(await createProductionApiOptions())
      const live = await application.handle(new Request('http://api.test/internal/live'))
      const provider = await application.handle(new Request(`http://api.test${providerPath}`))

      expect(live.status).toBe(200)
      expect(provider.status).toBe(200)
      expect(await provider.json()).toEqual({ models: [] })
      expect(provider.headers.get('x-sim-api-backend')).toBe('native')
      expect(fetcher).not.toHaveBeenCalled()
    }
  )

  it('serves all nine routes through production composition without a legacy API origin', async () => {
    for (const name of [
      'DATABASE_URL',
      'BETTER_AUTH_SECRET',
      'BETTER_AUTH_URL',
      'NEXT_PUBLIC_APP_URL',
      'ENCRYPTION_KEY',
      'SIM_LEGACY_API_BASE_URL',
      'WORKER_ADMISSION_URL',
      'INTERNAL_EXECUTION_TOKEN',
    ]) {
      vi.stubEnv(name, '')
    }
    vi.stubEnv('BASETEN_API_KEY', 'env-baseten')
    vi.stubEnv('FIREWORKS_API_KEY', 'env-fireworks')
    vi.stubEnv('TOGETHER_API_KEY', 'env-together')
    vi.stubEnv('LITELLM_BASE_URL', 'https://litellm.test')
    vi.stubEnv('LITELLM_API_KEY', 'env-litellm')
    vi.stubEnv('VLLM_BASE_URL', 'https://vllm.test')
    vi.stubEnv('VLLM_API_KEY', 'env-vllm')
    vi.stubEnv('OLLAMA_URL', 'https://ollama.test')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        if (url.hostname === 'ollama.test') {
          return Response.json({ models: [{ name: 'ollama-a' }] })
        }
        if (url.hostname === 'api.together.ai') {
          return Response.json([{ id: 'chat-a', type: 'chat' }])
        }
        return Response.json({ data: [{ id: 'model-a' }] })
      })
    )
    const application = createApiApplication(await createProductionApiOptions())
    const paths = [
      ['API-0270', '/api/providers/base/models'],
      ['API-0271', '/api/providers/baseten/models?workspaceId=workspace-1'],
      ['API-0272', '/api/providers/fireworks/models?workspaceId=workspace-1'],
      ['API-0273', '/api/providers/litellm/models'],
      ['API-0274', '/api/providers/ollama-cloud/models?workspaceId=workspace-1'],
      ['API-0275', '/api/providers/ollama/models'],
      ['API-0276', '/api/providers/openrouter/models'],
      ['API-0278', '/api/providers/together/models?workspaceId=workspace-1'],
      ['API-0279', '/api/providers/vllm/models'],
    ] as const

    for (const [inventoryId, path] of paths) {
      const response = await application.handle(new Request(`http://api.test${path}`))
      expect(response.status).toBe(200)
      expect(response.headers.get('x-sim-api-inventory-id')).toBe(inventoryId)
      expect(response.headers.get('x-sim-api-backend')).toBe('native')
      expect(providerModelsResponseV1Schema.safeParse(await response.json()).success).toBe(true)
    }
  })
})

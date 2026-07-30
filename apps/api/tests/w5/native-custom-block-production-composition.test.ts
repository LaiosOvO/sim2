import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApiApplication } from '@/bootstrap/application/create-api-application'
import { createProductionApiOptions } from '@/bootstrap/composition/create-production-api-options'

const productionEnvironmentNames = [
  'DATABASE_URL',
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
  'NEXT_PUBLIC_APP_URL',
  'ENCRYPTION_KEY',
  'SIM_LEGACY_API_BASE_URL',
  'WORKER_ADMISSION_URL',
  'SIM_WORKER_URL',
  'INTERNAL_EXECUTION_TOKEN',
  'EXECUTION_OBJECT_STORE_URL',
  'APPCONFIG_APPLICATION',
  'APPCONFIG_ENVIRONMENT',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
] as const

function clearProductionEnvironment(): void {
  for (const name of productionEnvironmentNames) vi.stubEnv(name, '')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('W5 production composition', () => {
  it('owns every custom-block inventory natively without a legacy API origin', async () => {
    clearProductionEnvironment()
    vi.stubEnv('DATABASE_URL', 'postgresql://postgres:postgres@127.0.0.1:9/unreachable')
    vi.stubEnv('BETTER_AUTH_SECRET', 'w5-production-composition-secret-at-least-32-characters')
    vi.stubEnv('BETTER_AUTH_URL', 'http://api.test')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://api.test')
    vi.stubEnv('DEPLOY_AS_BLOCK', 'true')
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)

    const application = createApiApplication(await createProductionApiOptions())
    const routes = [
      ['API-0045', '/api/blocks/visibility?workspaceId=workspace-1', 'GET'],
      ['API-0094', '/api/custom-blocks/block-1', 'PATCH'],
      ['API-0094', '/api/custom-blocks/block-1', 'DELETE'],
      ['API-0095', '/api/custom-blocks/block-1/usages', 'GET'],
      ['API-0096', '/api/custom-blocks?workspaceId=workspace-1', 'GET'],
      ['API-0096', '/api/custom-blocks', 'POST'],
    ] as const

    for (const [inventoryId, path, method] of routes) {
      const response = await application.handle(
        new Request(`http://api.test${path}`, {
          method,
          ...(method === 'PATCH' || method === 'POST'
            ? { body: '{}', headers: { 'content-type': 'application/json' } }
            : {}),
        })
      )
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'Unauthorized' })
      expect(response.headers.get('x-sim-api-inventory-id')).toBe(inventoryId)
      expect(response.headers.get('x-sim-api-backend')).toBe('native')
    }
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('fails closed when authentication/database composition is unavailable', async () => {
    clearProductionEnvironment()
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)

    const application = createApiApplication(await createProductionApiOptions())
    const response = await application.handle(
      new Request('http://api.test/api/custom-blocks?workspaceId=workspace-1')
    )

    expect(response.status).not.toBe(200)
    expect(response.headers.get('x-sim-api-backend')).not.toBe('legacy')
    expect(fetcher).not.toHaveBeenCalled()
  })
})

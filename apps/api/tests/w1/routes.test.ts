import {
  healthResponseSchema,
  personalEnvironmentResponseSchema,
  publicStatusResponseSchema,
} from '@sim/api-contracts'
import { createRequestAuthenticator } from '@sim/auth/request-context'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApiApplication } from '@/bootstrap/application/create-api-application'
import { createProductionApiOptions } from '@/bootstrap/composition/create-production-api-options'
import { createEnvironmentModule } from '@/modules/environment/application/create-environment-module'
import type { EnvironmentModuleDependencies } from '@/modules/environment/application/ports'
import { createStatusModule } from '@/modules/status/application/create-status-module'

const fixedNow = new Date('2026-07-30T00:00:00.000Z')

afterEach(() => {
  vi.unstubAllEnvs()
})

function fixture() {
  const stored: { variables: Record<string, string> } = {
    variables: { EXISTING: 'encrypted:old-value' },
  }
  const dependencies: EnvironmentModuleDependencies = {
    authentication: createRequestAuthenticator({
      sessions: {
        async verify(headers) {
          return headers.get('cookie') === 'session=valid'
            ? {
                verified: true,
                credential: {
                  actor: {
                    id: 'user-1',
                    type: 'user',
                    name: 'Ada',
                    email: 'ada@example.com',
                  },
                  sessionId: 'session-1',
                  activeOrganizationId: null,
                },
              }
            : { verified: false, reason: 'invalid' }
        },
      },
    }),
    repository: {
      async getEncryptedVariables() {
        return stored.variables
      },
      async upsertEncryptedVariables(_userId, variables) {
        stored.variables = variables
      },
    },
    cipher: {
      async encrypt(value) {
        return `encrypted:${value}`
      },
      async decrypt(value) {
        return value.replace(/^encrypted:/, '')
      },
    },
    credentials: { synchronize: vi.fn(async () => undefined) },
    audit: { updated: vi.fn(async () => undefined) },
    events: { updated: vi.fn(async () => undefined) },
  }
  const status = createStatusModule({
    now: () => fixedNow,
    fetcher: vi.fn(async () =>
      Response.json({
        page_url: 'https://status.sim.ai',
        ongoing_incidents: [],
        in_progress_maintenances: [],
      })
    ) as typeof fetch,
  })
  const application = createApiApplication({
    now: () => fixedNow,
    environment: createEnvironmentModule(dependencies),
    status,
  })
  return { application, dependencies, stored }
}

describe('W1 route compatibility', () => {
  it('matches the legacy health response and propagates request identity headers', async () => {
    const { application } = fixture()
    const response = await application.handle(
      new Request('http://api.test/api/health', {
        headers: { 'x-request-id': 'request-health-1' },
      })
    )

    expect(response.status).toBe(200)
    expect(healthResponseSchema.parse(await response.json())).toEqual({
      status: 'ok',
      timestamp: fixedNow.toISOString(),
    })
    expect(response.headers.get('x-request-id')).toBe('request-health-1')
    expect(response.headers.get('x-api-contract-version')).toBe('1')
  })

  it('matches the legacy public status body and cache headers', async () => {
    const { application } = fixture()
    const response = await application.handle(new Request('http://api.test/api/status'))

    expect(response.status).toBe(200)
    expect(publicStatusResponseSchema.parse(await response.json())).toEqual({
      status: 'operational',
      message: 'All Systems Operational',
      url: 'https://status.sim.ai',
      lastUpdated: fixedNow.toISOString(),
    })
    expect(response.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=60')
    expect(response.headers.get('x-cache')).toBe('MISS')
  })

  it('matches the legacy status query rejection', async () => {
    const { application } = fixture()
    const response = await application.handle(
      new Request('http://api.test/api/status?unexpected=value')
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'Validation error',
      details: [
        {
          code: 'unrecognized_keys',
          keys: ['unexpected'],
          path: [],
          message: 'Unrecognized key: "unexpected"',
        },
      ],
    })
  })

  it('matches the legacy authenticated environment GET response', async () => {
    const { application } = fixture()
    const unauthorized = await application.handle(new Request('http://api.test/api/environment'))
    expect(unauthorized.status).toBe(401)
    expect(await unauthorized.json()).toEqual({ error: 'Unauthorized' })

    const response = await application.handle(
      new Request('http://api.test/api/environment', {
        headers: { cookie: 'session=valid' },
      })
    )
    expect(response.status).toBe(200)
    expect(personalEnvironmentResponseSchema.parse(await response.json())).toEqual({
      data: {
        EXISTING: { key: 'EXISTING', value: 'old-value' },
      },
    })
  })

  it('matches the legacy environment POST wire contract and side-effect ports', async () => {
    const { application, dependencies, stored } = fixture()
    const response = await application.handle(
      new Request('http://api.test/api/environment', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'session=valid',
        },
        body: JSON.stringify({
          variables: {
            API_KEY: 'secret-value',
            REGION: 'cn',
          },
        }),
      })
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })
    expect(stored.variables).toEqual({
      API_KEY: 'encrypted:secret-value',
      REGION: 'encrypted:cn',
    })
    expect(dependencies.credentials.synchronize).toHaveBeenCalledWith('user-1', [
      'API_KEY',
      'REGION',
    ])
    expect(dependencies.audit.updated).toHaveBeenCalledOnce()
    expect(dependencies.audit.updated).toHaveBeenCalledWith(
      expect.objectContaining({
        authenticationContext: expect.objectContaining({
          authenticationMethod: 'session',
          actor: expect.objectContaining({ id: 'user-1' }),
        }),
      })
    )
    expect(dependencies.events.updated).toHaveBeenCalledWith({
      actorId: 'user-1',
      keyCount: 2,
    })
  })

  it('authenticates before reading or validating the request body', async () => {
    const { application, dependencies } = fixture()
    const authenticate = vi.spyOn(dependencies.authentication, 'authenticate')
    const request = new Request('http://api.test/api/environment', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{invalid-json',
    })
    const bodyReader = vi.spyOn(request, 'json')

    const response = await application.handle(request)

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(authenticate).toHaveBeenCalledOnce()
    expect(bodyReader).not.toHaveBeenCalled()
  })

  it('reports readiness independently from liveness', async () => {
    const application = createApiApplication({
      now: () => fixedNow,
      readinessChecks: {
        configuration: async () => true,
        database: async () => false,
      },
    })
    const live = await application.handle(new Request('http://api.test/internal/live'))
    const ready = await application.handle(new Request('http://api.test/internal/ready'))

    expect(live.status).toBe(200)
    expect(ready.status).toBe(503)
    expect(await ready.json()).toEqual({
      contractVersion: 1,
      status: 'not-ready',
      checks: { configuration: true, database: false },
    })
  })

  it('starts liveness with not-ready status when production dependencies are unconfigured', async () => {
    vi.stubEnv('DATABASE_URL', '')
    vi.stubEnv('BETTER_AUTH_SECRET', '')
    vi.stubEnv('BETTER_AUTH_URL', '')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
    vi.stubEnv('ENCRYPTION_KEY', '')
    const application = createApiApplication(await createProductionApiOptions())

    const live = await application.handle(new Request('http://api.test/internal/live'))
    const ready = await application.handle(new Request('http://api.test/internal/ready'))

    expect(live.status).toBe(200)
    expect(ready.status).toBe(503)
  })
})

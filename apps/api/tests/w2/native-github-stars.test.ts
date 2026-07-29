import { w2TenantReadRouteContracts } from '@sim/api-contracts/w2-tenant-read'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApiApplication } from '@/bootstrap/application/create-api-application'
import { createProductionApiOptions } from '@/bootstrap/composition/create-production-api-options'
import {
  createRoutedTenantReadBackend,
  createUnavailableTenantReadBackend,
} from '@/modules/tenant-read/application/create-routed-tenant-read-backend'
import type { TenantReadBackendInput } from '@/modules/tenant-read/application/ports'
import {
  createGitHubStarsHandler,
  formatStarCount,
} from '@/modules/tenant-read/infrastructure/native/github-stars-handler'

const starsRoute = w2TenantReadRouteContracts.find((route) => route.inventoryId === 'API-0294')!
const invitationsRoute = w2TenantReadRouteContracts.find(
  (route) => route.inventoryId === 'API-0137'
)!

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

function input(
  route: (typeof w2TenantReadRouteContracts)[number],
  url: string
): TenantReadBackendInput {
  return {
    request: new Request(url),
    requestId: 'request-1',
    route,
  }
}

describe('native GitHub stars tenant-read handler', () => {
  it.each([
    [999, '999'],
    [1000, '1k'],
    [28_949, '28.9k'],
    [28_950, '29k'],
  ])('formats %i as %s', (value, expected) => {
    expect(formatStarCount(value)).toBe(expected)
  })

  it('fetches once, forwards the optional token and caches for one hour', async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer github-token')
      return Response.json({ stargazers_count: 31_240 })
    }) as typeof fetch
    let now = 1000
    const handler = createGitHubStarsHandler({
      fetcher,
      token: 'github-token',
      now: () => now,
    })

    const first = await handler(input(starsRoute, 'http://api.test/api/stars'))
    now += 1000
    const cached = await handler(input(starsRoute, 'http://api.test/api/stars'))

    expect(await first.json()).toEqual({ stars: '31.2k' })
    expect(await cached.json()).toEqual({ stars: '31.2k' })
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('preserves legacy no-input validation without contacting GitHub', async () => {
    const fetcher = vi.fn()
    const handler = createGitHubStarsHandler({ fetcher: fetcher as typeof fetch })

    const response = await handler(input(starsRoute, 'http://api.test/api/stars?unexpected=value'))

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
    expect(fetcher).not.toHaveBeenCalled()
  })

  it.each(['provider error', 'invalid provider payload'])(
    'returns the conservative fallback on %s',
    async (scenario) => {
      const fetcher = vi.fn(async () => {
        if (scenario === 'provider error') throw new Error('GitHub unavailable')
        return Response.json({ stargazers_count: 'not-a-number' })
      }) as typeof fetch
      const handler = createGitHubStarsHandler({ fetcher })

      const response = await handler(input(starsRoute, 'http://api.test/api/stars'))

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ stars: '28.9k' })
    }
  )

  it('routes only the declared native inventory ID and fails closed without legacy origin', async () => {
    const nativeHandler = vi.fn(async () => Response.json({ stars: '30k' }))
    const backend = createRoutedTenantReadBackend({
      fallback: createUnavailableTenantReadBackend(),
      nativeHandlers: { 'API-0294': nativeHandler },
    })

    const native = await backend.forward(input(starsRoute, 'http://api.test/api/stars'))

    expect(native.backend).toBe('native')
    expect(await native.response.json()).toEqual({ stars: '30k' })
    await expect(
      backend.forward(input(invitationsRoute, 'http://api.test/api/invitations'))
    ).rejects.toThrow('Legacy tenant-read origin is not configured')
  })

  it('serves the native route in production composition without a legacy origin', async () => {
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
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ stargazers_count: 32_100 }))
    )
    const application = createApiApplication(await createProductionApiOptions())

    const stars = await application.handle(new Request('http://api.test/api/stars'))
    const protectedRoute = await application.handle(new Request('http://api.test/api/invitations'))

    expect(stars.status).toBe(200)
    expect(await stars.json()).toEqual({ stars: '32.1k' })
    expect(stars.headers.get('x-sim-api-backend')).toBe('native')
    expect(protectedRoute.status).toBe(503)
  })
})

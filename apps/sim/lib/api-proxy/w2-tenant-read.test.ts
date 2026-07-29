import { w2TenantReadRouteContracts } from '@sim/api-contracts/w2-tenant-read'
import { describe, expect, it, vi } from 'vitest'
import { proxyW2TenantReadRequest } from '@/lib/api-proxy/w2-tenant-read'

function concretePath(pathTemplate: string): string {
  return pathTemplate.replaceAll('[id]', 'workspace-1').replaceAll('[drainId]', 'drain-1')
}

describe('W2 tenant-read Next compatibility proxy', () => {
  it.each(w2TenantReadRouteContracts)(
    'binds $inventoryId to $pathTemplate without importing the route implementation',
    async (route) => {
      const path = concretePath(route.pathTemplate)
      const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        expect(String(input)).toBe(`http://api.internal:3002${path}?source=web`)
        expect(new Headers(init?.headers).get('cookie')).toBe('session=valid')
        expect(new Headers(init?.headers).get('x-api-key')).toBe('key-1')
        expect(new Headers(init?.headers).get('authorization')).toBe('Bearer internal-1')
        expect(new Headers(init?.headers).get('x-request-id')).toBe(`request-${route.inventoryId}`)
        return Response.json(
          { inventoryId: route.inventoryId },
          { headers: { 'x-legacy-shape': 'preserved' } }
        )
      }) as typeof fetch

      const response = await proxyW2TenantReadRequest(
        new Request(`http://web.test${path}?source=web`, {
          headers: {
            authorization: 'Bearer internal-1',
            cookie: 'session=valid',
            'x-api-key': 'key-1',
            'x-request-id': `request-${route.inventoryId}`,
          },
        }),
        route.inventoryId,
        {
          fetcher,
          apiBaseUrl: 'http://api.internal:3002',
          mode: 'api',
        }
      )

      expect(response.status).toBe(200)
      expect(response.headers.get('x-sim-api-route')).toBe(`${route.inventoryId}:api`)
      expect(response.headers.get('x-legacy-shape')).toBe('preserved')
      expect(await response.json()).toEqual({ inventoryId: route.inventoryId })
      expect(fetcher).toHaveBeenCalledOnce()
    }
  )

  it('falls back to the fixed legacy origin after an API transport failure', async () => {
    const targets: string[] = []
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      targets.push(String(input))
      if (targets.length === 1) throw new Error('API unavailable')
      return Response.json({ invitations: [] })
    }) as typeof fetch

    const response = await proxyW2TenantReadRequest(
      new Request('http://web.test/api/invitations'),
      'API-0137',
      {
        fetcher,
        apiBaseUrl: 'http://api.internal:3002',
        legacyBaseUrl: 'http://legacy.internal:3000',
        mode: 'api',
        fallbackToLegacy: true,
      }
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('x-sim-api-route')).toBe('API-0137:legacy')
    expect(targets).toEqual([
      'http://api.internal:3002/api/invitations',
      'http://legacy.internal:3000/api/invitations',
    ])
  })

  it('supports legacy and off rollout modes', async () => {
    const fetcher = vi.fn(async () => Response.json({ stars: [] })) as typeof fetch
    const legacy = await proxyW2TenantReadRequest(
      new Request('http://web.test/api/stars'),
      'API-0294',
      {
        fetcher,
        legacyBaseUrl: 'http://legacy.internal:3000',
        mode: 'legacy',
      }
    )
    const off = await proxyW2TenantReadRequest(
      new Request('http://web.test/api/stars'),
      'API-0294',
      {
        fetcher,
        mode: 'off',
      }
    )

    expect(legacy.headers.get('x-sim-api-route')).toBe('API-0294:legacy')
    expect(off.status).toBe(503)
    expect(off.headers.get('x-sim-api-route')).toBe('API-0294:off')
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('rejects a generated route binding mismatch before contacting a backend', async () => {
    const fetcher = vi.fn()
    const response = await proxyW2TenantReadRequest(
      new Request('http://web.test/api/stars'),
      'API-0137',
      { fetcher: fetcher as typeof fetch }
    )

    expect(response.status).toBe(500)
    expect(fetcher).not.toHaveBeenCalled()
  })
})

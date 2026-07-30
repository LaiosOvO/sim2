/**
 * @vitest-environment node
 */
import { providerModelDiscoveryRoutesV1 } from '@sim/api-contracts/provider-model-discovery'
import { describe, expect, it, vi } from 'vitest'
import { proxyProviderModelDiscoveryRequest } from '@/lib/api-proxy/provider-model-discovery'

describe('provider model discovery API proxy', () => {
  it('forwards all nine exact paths, query, cookie, and request identity to the API', async () => {
    for (const route of providerModelDiscoveryRoutesV1) {
      const fetcher = vi.fn(async () =>
        Response.json(
          { models: [`model-${route.inventoryId}`] },
          { headers: { 'x-api-response': route.inventoryId } }
        )
      )
      const request = new Request(`http://sim.test${route.path}?workspaceId=workspace-1`, {
        headers: {
          connection: 'keep-alive',
          cookie: 'session=opaque',
          host: 'sim.test',
          'x-correlation-id': `correlation-${route.inventoryId}`,
        },
      })

      const response = await proxyProviderModelDiscoveryRequest(request, route.inventoryId, {
        apiBaseUrl: 'http://api.internal:3002',
        fetcher: fetcher as typeof fetch,
      })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        models: [`model-${route.inventoryId}`],
      })
      expect(response.headers.get('x-request-id')).toBe(`correlation-${route.inventoryId}`)
      expect(response.headers.get('x-sim-api-route')).toBe(`${route.inventoryId}:api`)
      expect(response.headers.get('x-api-response')).toBe(route.inventoryId)

      const [target, init] = fetcher.mock.calls[0]
      expect(String(target)).toBe(`http://api.internal:3002${route.path}?workspaceId=workspace-1`)
      const headers = new Headers(init.headers)
      expect(headers.get('cookie')).toBe('session=opaque')
      expect(headers.get('x-request-id')).toBe(`correlation-${route.inventoryId}`)
      expect(headers.has('connection')).toBe(false)
      expect(headers.has('host')).toBe(false)
      expect(init.method).toBe('GET')
      expect(init.redirect).toBe('manual')
    }
  })

  it('rejects route drift before contacting the API', async () => {
    const fetcher = vi.fn()
    const response = await proxyProviderModelDiscoveryRequest(
      new Request('http://sim.test/api/providers/base/not-models'),
      'API-0270',
      { apiBaseUrl: 'http://api.internal:3002', fetcher: fetcher as typeof fetch }
    )

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Route mismatch' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('closes recursion and network failures with stable 503 responses', async () => {
    const recursive = await proxyProviderModelDiscoveryRequest(
      new Request('http://sim.test/api/providers/base/models', {
        headers: { 'x-request-id': 'request-recursive' },
      }),
      'API-0270',
      { apiBaseUrl: 'http://sim.test' }
    )
    expect(recursive.status).toBe(503)
    expect(recursive.headers.get('x-request-id')).toBe('request-recursive')
    expect(await recursive.json()).toEqual({
      error: 'API route unavailable',
      requestId: 'request-recursive',
    })

    const unavailable = await proxyProviderModelDiscoveryRequest(
      new Request('http://sim.test/api/providers/vllm/models', {
        headers: { 'x-request-id': 'request-unavailable' },
      }),
      'API-0279',
      {
        apiBaseUrl: 'http://api.internal:3002',
        fetcher: vi.fn(async () => {
          throw new Error('network down')
        }) as typeof fetch,
      }
    )
    expect(unavailable.status).toBe(503)
    expect(unavailable.headers.get('retry-after')).toBe('1')
    expect(unavailable.headers.get('x-sim-api-route')).toBe('API-0279:unavailable')
  })
})

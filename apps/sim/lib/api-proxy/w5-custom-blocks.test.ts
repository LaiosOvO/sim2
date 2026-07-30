/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest'
import { proxyW5CustomBlockRequest } from '@/lib/api-proxy/w5-custom-blocks'

describe('W5 custom-block proxy', () => {
  it('forwards method, body, cookie, query, and request id to the native API', async () => {
    const fetcher = vi.fn(async (target: string | URL | Request, init?: RequestInit) => {
      expect(String(target)).toBe('http://api.test/api/custom-blocks?workspaceId=workspace-1')
      expect(init?.method).toBe('POST')
      expect(new Headers(init?.headers).get('cookie')).toBe('session=valid')
      expect(new Headers(init?.headers).get('x-request-id')).toBe('request-w5')
      expect(new TextDecoder().decode(init?.body as ArrayBuffer)).toContain('"name":"Child"')
      return Response.json({ ok: true })
    })
    const response = await proxyW5CustomBlockRequest(
      new Request('http://sim.test/api/custom-blocks?workspaceId=workspace-1', {
        method: 'POST',
        headers: { cookie: 'session=valid', 'x-request-id': 'request-w5' },
        body: JSON.stringify({ name: 'Child' }),
      }),
      'API-0096',
      { fetcher: fetcher as typeof fetch, apiBaseUrl: 'http://api.test', mode: 'api' }
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('x-sim-api-route')).toBe('API-0096:api')
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('supports explicit legacy routing and bounded fallback', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('native down'))
      .mockResolvedValueOnce(Response.json({ usageCount: 1, deployedUsageCount: 0 }))
    const response = await proxyW5CustomBlockRequest(
      new Request('http://sim.test/api/custom-blocks/block-1/usages'),
      'API-0095',
      {
        fetcher: fetcher as typeof fetch,
        apiBaseUrl: 'http://api.test',
        legacyBaseUrl: 'http://legacy.test',
        fallbackToLegacy: true,
        mode: 'api',
      }
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('x-sim-api-route')).toBe('API-0095:legacy')
  })

  it('fails closed when off or unavailable', async () => {
    const off = await proxyW5CustomBlockRequest(
      new Request('http://sim.test/api/custom-blocks'),
      'API-0096',
      { mode: 'off' }
    )
    expect(off.status).toBe(503)
    expect(off.headers.get('x-sim-api-route')).toBe('API-0096:off')

    const unavailable = await proxyW5CustomBlockRequest(
      new Request('http://sim.test/api/custom-blocks'),
      'API-0096',
      {
        fetcher: vi.fn(async () => {
          throw new Error('down')
        }) as typeof fetch,
        apiBaseUrl: 'http://api.test',
        mode: 'api',
      }
    )
    expect(unavailable.status).toBe(503)
    expect(unavailable.headers.get('retry-after')).toBe('1')
  })
})

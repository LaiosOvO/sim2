import { describe, expect, it, vi } from 'vitest'
import { proxyW6ExecutionReadRequest } from '@/lib/api-proxy/w6-execution-read'

describe('W6 execution-read proxy', () => {
  it.each([
    ['API-0282', '/api/resume/workflow-1/execution-1'],
    ['API-0996', '/api/workflows/workflow-1/paused/execution-1'],
    ['API-0997', '/api/workflows/workflow-1/paused?status=paused'],
  ] as const)('forwards %s to the API without compiling execution code', async (routeId, path) => {
    const fetcher = vi.fn(async (request: Request) =>
      Response.json(
        { ok: true },
        {
          headers: {
            'x-sim-api-inventory-id': routeId,
          },
        }
      )
    )
    const response = await proxyW6ExecutionReadRequest(
      new Request(`http://sim.test${path}`, {
        headers: {
          cookie: 'session=valid',
          'x-request-id': 'request-w6',
        },
      }),
      routeId,
      {
        fetcher,
        apiBaseUrl: 'http://api.test',
        mode: 'api',
      }
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('x-sim-api-route')).toBe(`${routeId}:api`)
    expect(response.headers.get('x-request-id')).toBe('request-w6')
    expect(fetcher).toHaveBeenCalledOnce()
    const forwarded = fetcher.mock.calls[0]?.[0] as URL
    const init = fetcher.mock.calls[0]?.[1] as RequestInit
    expect(forwarded.toString()).toBe(`http://api.test${path}`)
    expect(new Headers(init.headers).get('cookie')).toBe('session=valid')
  })

  it('rejects route confusion and exposes a stable unavailable response', async () => {
    const mismatch = await proxyW6ExecutionReadRequest(
      new Request('http://sim.test/api/workflows/workflow-1/paused'),
      'API-0282',
      { mode: 'api' }
    )
    expect(mismatch.status).toBe(500)

    const unavailable = await proxyW6ExecutionReadRequest(
      new Request('http://sim.test/api/resume/workflow-1/execution-1'),
      'API-0282',
      {
        mode: 'api',
        apiBaseUrl: 'http://api.test',
        fetcher: vi.fn(async () => {
          throw new Error('offline')
        }),
      }
    )
    expect(unavailable.status).toBe(503)
    expect(unavailable.headers.get('x-sim-api-route')).toBe('API-0282:unavailable')
  })
})

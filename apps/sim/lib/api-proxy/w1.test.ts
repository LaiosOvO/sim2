import { createRequestAuthenticator } from '@sim/auth/request-context'
import { describe, expect, it, vi } from 'vitest'
import { proxyW1Request } from '@/lib/api-proxy/w1'

describe('W1 Next compatibility proxy', () => {
  it('forwards cookies, body, route and request ID to the independent API', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe('http://api.internal:3002/api/environment?source=web')
      expect(new Headers(init?.headers).get('cookie')).toBe('session=valid')
      expect(new Headers(init?.headers).get('x-request-id')).toBe('request-1')
      expect(await new Response(init?.body).json()).toEqual({
        variables: { KEY: 'value' },
      })
      return Response.json({ success: true }, { status: 200 })
    }) as typeof fetch

    const response = await proxyW1Request(
      new Request('http://web.test/api/environment?source=web', {
        method: 'POST',
        headers: {
          cookie: 'session=valid',
          'content-type': 'application/json',
          'x-request-id': 'request-1',
        },
        body: JSON.stringify({ variables: { KEY: 'value' } }),
      }),
      'environment',
      {
        fetcher,
        apiBaseUrl: 'http://api.internal:3002',
        mode: 'api',
      }
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('x-request-id')).toBe('request-1')
    expect(response.headers.get('x-sim-api-route')).toBe('environment:api')
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('falls back to the remote legacy deployment after an API transport failure', async () => {
    const targets: string[] = []
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      targets.push(String(input))
      if (targets.length === 1) throw new Error('API unavailable')
      return Response.json({ status: 'ok', timestamp: '2026-07-30T00:00:00.000Z' })
    }) as typeof fetch

    const response = await proxyW1Request(new Request('http://web.test/api/health'), 'health', {
      fetcher,
      apiBaseUrl: 'http://api.internal:3002',
      legacyBaseUrl: 'http://legacy.internal:3000',
      mode: 'api',
      fallbackToLegacy: true,
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('x-sim-api-route')).toBe('health:legacy')
    expect(targets).toEqual([
      'http://api.internal:3002/api/health',
      'http://legacy.internal:3000/api/health',
    ])
  })

  it('supports a per-route off switch without contacting either backend', async () => {
    const fetcher = vi.fn()
    const response = await proxyW1Request(new Request('http://web.test/api/status'), 'status', {
      fetcher: fetcher as typeof fetch,
      mode: 'off',
    })

    expect(response.status).toBe(503)
    expect(response.headers.get('x-sim-api-route')).toBe('status:off')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it.each([
    ['valid', true, 200],
    ['revoked', false, 401],
  ] as const)(
    'keeps %s session identity and rejection identical across direct API and Next facade',
    async (cookieValue, expectedOk, expectedStatus) => {
      const authenticator = createRequestAuthenticator({
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
                    activeOrganizationId: 'org-1',
                  },
                }
              : { verified: false, reason: 'revoked' }
          },
        },
      })
      const authenticate = (request: Request) =>
        authenticator.authenticate({
          request,
          requestId: request.headers.get('x-request-id') ?? 'missing-request-id',
          policy: { mode: 'session' },
        })
      const source = new Request('http://web.test/api/environment', {
        headers: {
          cookie: `session=${cookieValue}`,
          'x-request-id': 'request-parity',
        },
      })
      const direct = await authenticate(source.clone())
      const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const forwarded = new Request(input, init)
        const result = await authenticate(forwarded)
        return Response.json(result, { status: result.ok ? 200 : result.error.status })
      }) as typeof fetch

      const proxied = await proxyW1Request(source, 'environment', {
        fetcher,
        apiBaseUrl: 'http://api.internal:3002',
        mode: 'api',
      })

      expect(proxied.status).toBe(expectedStatus)
      expect(direct.ok).toBe(expectedOk)
      expect(await proxied.json()).toEqual(direct)
    }
  )
})

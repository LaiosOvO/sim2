import { describe, expect, it, vi } from 'vitest'
import { createHttpLegacyTenantReadBackend } from '@/modules/tenant-read/infrastructure/http-legacy-tenant-read-backend'

describe('W2 HTTP legacy tenant-read backend', () => {
  it('preserves path, query and credentials while marking the migration hop', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe(
        'http://legacy.internal:3000/api/workspaces/workspace-1/members?cursor=next'
      )
      const headers = new Headers(init?.headers)
      expect(headers.get('cookie')).toBe('session=valid')
      expect(headers.get('x-api-key')).toBe('api-key-valid')
      expect(headers.get('x-request-id')).toBe('request-1')
      expect(headers.get('x-sim-migration-hop')).toBe('api-w2-tenant-read')
      expect(headers.has('host')).toBe(false)
      return new Response('legacy-bytes', {
        status: 207,
        headers: { 'x-legacy-response': 'preserved' },
      })
    }) as typeof fetch
    const backend = createHttpLegacyTenantReadBackend({
      baseUrl: 'http://legacy.internal:3000',
      fetcher,
    })

    const response = await backend.forward({
      request: new Request(
        'http://api.internal:3002/api/workspaces/workspace-1/members?cursor=next',
        {
          headers: {
            cookie: 'session=valid',
            host: 'api.internal:3002',
            'x-api-key': 'api-key-valid',
          },
        }
      ),
      requestId: 'request-1',
      route: {
        inventoryId: 'API-1057',
        method: 'GET',
        pathTemplate: '/api/workspaces/[id]/members',
        domain: 'workspaces',
        authMode: 'session',
        requiredTests: ['contract', 'auth', 'differential', 'integration'],
      },
    })

    expect(response.status).toBe(207)
    expect(response.headers.get('x-legacy-response')).toBe('preserved')
    expect(await response.text()).toBe('legacy-bytes')
  })

  it('refuses a legacy origin that would recurse into the same API', async () => {
    const fetcher = vi.fn()
    const backend = createHttpLegacyTenantReadBackend({
      baseUrl: 'http://api.internal:3002',
      fetcher: fetcher as typeof fetch,
    })

    await expect(
      backend.forward({
        request: new Request('http://api.internal:3002/api/invitations'),
        requestId: 'request-2',
        route: {
          inventoryId: 'API-0137',
          method: 'GET',
          pathTemplate: '/api/invitations',
          domain: 'invitations',
          authMode: 'session',
          requiredTests: ['contract', 'auth', 'differential', 'integration'],
        },
      })
    ).rejects.toThrow('Refusing recursive W2 tenant-read legacy target')
    expect(fetcher).not.toHaveBeenCalled()
  })
})

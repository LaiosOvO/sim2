import {
  type W2TenantReadAuthMode,
  w2TenantReadRouteContracts,
} from '@sim/api-contracts/w2-tenant-read'
import { createRequestAuthenticator } from '@sim/auth/request-context'
import { describe, expect, it, vi } from 'vitest'
import { createApiApplication } from '@/bootstrap/application/create-api-application'
import { createTenantReadModule } from '@/modules/tenant-read/application/create-tenant-read-module'
import type { TenantReadCompatibilityBackend } from '@/modules/tenant-read/application/ports'

function concretePath(pathTemplate: string): string {
  return pathTemplate.replaceAll('[id]', 'workspace-1').replaceAll('[drainId]', 'drain-1')
}

function headersFor(mode: W2TenantReadAuthMode): HeadersInit {
  if (mode === 'session' || mode === 'hybrid-all' || mode === 'session-internal') {
    return { cookie: 'session=valid' }
  }
  if (mode === 'legacy-cron') return { authorization: 'Bearer cron-secret' }
  return {}
}

function authenticator() {
  return createRequestAuthenticator({
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
    apiKeys: {
      async verify(apiKey) {
        return apiKey === 'api-key-valid'
          ? {
              verified: true,
              credential: {
                actor: {
                  id: 'user-1',
                  type: 'user',
                  name: 'Ada',
                  email: 'ada@example.com',
                },
                keyId: 'key-1',
                keyType: 'personal',
                workspaceId: null,
              },
            }
          : { verified: false, reason: 'revoked' }
      },
    },
    internal: {
      async verify(token) {
        return token === 'internal-valid'
          ? {
              verified: true,
              credential: {
                actor: { id: 'service-1', type: 'service', name: 'worker' },
                service: 'worker',
                scopes: ['tenant:read'],
              },
            }
          : { verified: false, reason: 'revoked' }
      },
    },
  })
}

describe('W2 tenant-read compatibility module', () => {
  it.each(w2TenantReadRouteContracts)(
    'preserves $inventoryId wire output through the independent API',
    async (route) => {
      const path = concretePath(route.pathTemplate)
      const backend: TenantReadCompatibilityBackend = {
        async forward({ request, requestId, route: selectedRoute }) {
          expect(request.method).toBe('GET')
          expect(new URL(request.url).pathname).toBe(path)
          expect(new URL(request.url).search).toBe('?cursor=next')
          expect(requestId).toBe(`request-${route.inventoryId}`)
          expect(selectedRoute.inventoryId).toBe(route.inventoryId)
          return new Response(`legacy:${route.inventoryId}:body`, {
            status: 206,
            headers: {
              'content-type': 'application/octet-stream',
              'x-legacy-response': route.inventoryId,
            },
          })
        },
      }
      const application = createApiApplication({
        tenantRead: createTenantReadModule({
          authentication: authenticator(),
          backend,
        }),
      })

      const response = await application.handle(
        new Request(`http://api.test${path}?cursor=next`, {
          headers: {
            ...headersFor(route.authMode),
            'x-request-id': `request-${route.inventoryId}`,
          },
        })
      )

      expect(response.status).toBe(206)
      expect(await response.text()).toBe(`legacy:${route.inventoryId}:body`)
      expect(response.headers.get('content-type')).toBe('application/octet-stream')
      expect(response.headers.get('x-legacy-response')).toBe(route.inventoryId)
      expect(response.headers.get('x-sim-api-module')).toBe('tenant-read-compatibility')
      expect(response.headers.get('x-sim-api-inventory-id')).toBe(route.inventoryId)
      expect(response.headers.get('x-sim-api-backend')).toBe('legacy-origin')
      expect(response.headers.get('x-request-id')).toBe(`request-${route.inventoryId}`)
    }
  )

  it('authenticates a protected route before invoking the compatibility backend', async () => {
    const backend = { forward: vi.fn() }
    const authentication = authenticator()
    const authenticate = vi.spyOn(authentication, 'authenticate')
    const application = createApiApplication({
      tenantRead: createTenantReadModule({ authentication, backend }),
    })

    const response = await application.handle(new Request('http://api.test/api/invitations'))

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(authenticate).toHaveBeenCalledOnce()
    expect(backend.forward).not.toHaveBeenCalled()
  })

  it.each([
    ['x-api-key', 'api-key-valid'],
    ['authorization', 'Bearer internal-valid'],
  ])('accepts %s credentials on the hybrid usage-limits route', async (header, value) => {
    const backend: TenantReadCompatibilityBackend = {
      async forward() {
        return Response.json({ allowed: true })
      },
    }
    const application = createApiApplication({
      tenantRead: createTenantReadModule({
        authentication: authenticator(),
        backend,
      }),
    })

    const response = await application.handle(
      new Request('http://api.test/api/users/me/usage-limits', {
        headers: { [header]: value },
      })
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ allowed: true })
  })

  it.each([
    ['/api/stars', 'API-0294'],
    ['/api/workspace-events/poll', 'API-1006'],
  ])('leaves %s public or legacy-cron verification with the legacy backend', async (path, id) => {
    const authentication = { authenticate: vi.fn() }
    const backend: TenantReadCompatibilityBackend = {
      forward: vi.fn(async () => Response.json({ id })),
    }
    const application = createApiApplication({
      tenantRead: createTenantReadModule({ authentication, backend }),
    })

    const response = await application.handle(new Request(`http://api.test${path}`))

    expect(response.status).toBe(200)
    expect(authentication.authenticate).not.toHaveBeenCalled()
    expect(backend.forward).toHaveBeenCalledOnce()
  })

  it('returns a stable retryable response when the legacy backend is unavailable', async () => {
    const application = createApiApplication({
      tenantRead: createTenantReadModule({
        authentication: authenticator(),
        backend: {
          async forward() {
            throw new Error('legacy unavailable')
          },
        },
      }),
    })

    const response = await application.handle(
      new Request('http://api.test/api/workspaces/workspace-1/members', {
        headers: { cookie: 'session=valid' },
      })
    )

    expect(response.status).toBe(503)
    expect(response.headers.get('retry-after')).toBe('1')
    expect(await response.json()).toEqual({ error: 'Tenant read backend unavailable' })
  })

  it('does not claim unrelated routes', async () => {
    const application = createApiApplication({
      tenantRead: createTenantReadModule({
        authentication: authenticator(),
        backend: { forward: vi.fn() },
      }),
    })

    const response = await application.handle(
      new Request('http://api.test/api/workspaces/workspace-1/mutations')
    )

    expect(response.status).toBe(404)
  })
})

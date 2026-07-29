import type { SessionRequestContext } from '@sim/api-contracts/auth'
import { listOrganizationWorkspacesResponseV1Schema } from '@sim/api-contracts/organizations'
import type { RequestAccessResolver } from '@sim/auth/authorization'
import { createRequestAuthenticator } from '@sim/auth/request-context'
import { describe, expect, it, vi } from 'vitest'
import { createApiApplication } from '@/bootstrap/application/create-api-application'
import { readAccessControlRuntimeConfig } from '@/config/enterprise-runtime'
import {
  createListOrganizationWorkspacesHandler,
  createListOrganizationWorkspacesUseCase,
  type OrganizationAccessControlEntitlementReader,
  type OrganizationWorkspaceReadRepository,
} from '@/modules/organizations'
import { createRoutedTenantReadBackend } from '@/modules/tenant-read/application/create-routed-tenant-read-backend'
import { createTenantReadModule } from '@/modules/tenant-read/application/create-tenant-read-module'

const sessionContext: SessionRequestContext = {
  authContextVersion: 1,
  requestId: 'request-0241',
  authenticationMethod: 'session',
  actor: {
    id: 'admin-1',
    type: 'user',
    name: 'Admin',
    email: 'admin@example.com',
  },
  credentialId: 'session-1',
  activeOrganizationId: 'organization-1',
  permissions: [],
}

function access(role: string | null): RequestAccessResolver {
  return {
    workspacePermission: vi.fn(async () => null),
    organizationRole: vi.fn(async () => role),
    workflow: vi.fn(async () => null),
  }
}

function entitlement(entitled = true): OrganizationAccessControlEntitlementReader {
  return {
    isEntitled: vi.fn(async () => entitled),
  }
}

function repository(): OrganizationWorkspaceReadRepository {
  return {
    listByOrganization: vi.fn(async () => [
      { id: 'workspace-archive', name: 'Archive' },
      { id: 'workspace-runtime', name: 'Runtime' },
    ]),
  }
}

function handler(
  options: {
    role?: string | null
    entitled?: boolean
    repository?: OrganizationWorkspaceReadRepository
  } = {}
) {
  return createListOrganizationWorkspacesHandler(
    createListOrganizationWorkspacesUseCase({
      access: access(options.role === undefined ? 'admin' : options.role),
      entitlement: entitlement(options.entitled),
      repository: options.repository ?? repository(),
    })
  )
}

describe('native organization workspace read', () => {
  it('matches the legacy response and keeps archived organization workspaces', async () => {
    const response = await handler()({
      request: new Request('http://api.test/api/organizations/organization-1/workspaces'),
      authenticationContext: sessionContext,
      requestId: 'request-0241',
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({
      workspaces: [
        { id: 'workspace-archive', name: 'Archive' },
        { id: 'workspace-runtime', name: 'Runtime' },
      ],
    })
    expect(listOrganizationWorkspacesResponseV1Schema.parse(body)).toEqual(body)
  })

  it('denies a plain organization member before checking entitlement', async () => {
    const accessResolver = access('member')
    const entitlementReader = entitlement()
    const source = repository()
    const response = await createListOrganizationWorkspacesHandler(
      createListOrganizationWorkspacesUseCase({
        access: accessResolver,
        entitlement: entitlementReader,
        repository: source,
      })
    )({
      request: new Request('http://api.test/api/organizations/organization-1/workspaces'),
      authenticationContext: sessionContext,
      requestId: 'request-0241',
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Admin permissions required' })
    expect(entitlementReader.isEntitled).not.toHaveBeenCalled()
    expect(source.listByOrganization).not.toHaveBeenCalled()
  })

  it('preserves the enterprise feature denial after the admin gate', async () => {
    const response = await handler({ entitled: false })({
      request: new Request('http://api.test/api/organizations/organization-1/workspaces'),
      authenticationContext: sessionContext,
      requestId: 'request-0241',
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: 'Access Control is an Enterprise feature',
    })
  })

  it('preserves the generic request-id error envelope for repository failures', async () => {
    const response = await handler({
      repository: {
        async listByOrganization() {
          throw new Error('database unavailable')
        },
      },
    })({
      request: new Request('http://api.test/api/organizations/organization-1/workspaces'),
      authenticationContext: sessionContext,
      requestId: 'request-0241',
    })

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: 'Internal server error',
      requestId: 'request-0241',
    })
  })

  it('executes through session authentication and API-0241 native routing', async () => {
    const authentication = createRequestAuthenticator({
      sessions: {
        async verify(headers) {
          return headers.get('cookie') === 'session=valid'
            ? {
                verified: true,
                credential: {
                  actor: sessionContext.actor,
                  sessionId: sessionContext.credentialId,
                  activeOrganizationId: sessionContext.activeOrganizationId,
                },
              }
            : { verified: false, reason: 'invalid' }
        },
      },
    })
    const application = createApiApplication({
      tenantRead: createTenantReadModule({
        authentication,
        backend: createRoutedTenantReadBackend({
          fallback: {
            async forward() {
              throw new Error('must not use legacy')
            },
          },
          nativeHandlers: { 'API-0241': handler() },
        }),
      }),
    })

    const response = await application.handle(
      new Request('http://api.test/api/organizations/organization-1/workspaces', {
        headers: {
          cookie: 'session=valid',
          'x-request-id': 'request-0241',
        },
      })
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('x-sim-api-backend')).toBe('native')
    expect(response.headers.get('x-sim-api-inventory-id')).toBe('API-0241')
  })

  it('parses the legacy billing and self-hosted access-control flags exactly', () => {
    expect(
      readAccessControlRuntimeConfig({
        BILLING_ENABLED: 'true',
        ACCESS_CONTROL_ENABLED: 'on',
        NEXT_PUBLIC_APP_URL: 'https://self-hosted.example.com',
      })
    ).toEqual({
      billingEnabled: true,
      accessControlEnabled: true,
      hosted: false,
    })
    expect(
      readAccessControlRuntimeConfig({
        BILLING_ENABLED: 'false',
        ACCESS_CONTROL_ENABLED: 'false',
        NEXT_PUBLIC_APP_URL: 'https://staging.sim.ai',
      })
    ).toEqual({
      billingEnabled: false,
      accessControlEnabled: false,
      hosted: true,
    })
  })
})

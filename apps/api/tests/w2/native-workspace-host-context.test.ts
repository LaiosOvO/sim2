import type { SessionRequestContext } from '@sim/api-contracts/auth'
import { workspaceHostContextV1Schema } from '@sim/api-contracts/workspaces'
import type { RequestAccessResolver } from '@sim/auth/authorization'
import { createRequestAuthenticator } from '@sim/auth/request-context'
import { describe, expect, it, vi } from 'vitest'
import { createApiApplication } from '@/bootstrap/application/create-api-application'
import { createRoutedTenantReadBackend } from '@/modules/tenant-read/application/create-routed-tenant-read-backend'
import { createTenantReadModule } from '@/modules/tenant-read/application/create-tenant-read-module'
import {
  createGetWorkspaceHostContextHandler,
  createGetWorkspaceHostContextUseCase,
  type WorkspaceHostContextReadRepository,
  type WorkspaceHostContextSnapshot,
} from '@/modules/workspaces'

const sessionContext: SessionRequestContext = {
  authContextVersion: 1,
  requestId: 'request-1041',
  authenticationMethod: 'session',
  actor: {
    id: 'external-1',
    type: 'user',
    name: 'External',
    email: 'external@example.com',
  },
  credentialId: 'session-1',
  activeOrganizationId: 'wrong-active-organization',
  permissions: [],
}

function access(permission: 'read' | 'write' | 'admin' | null = 'read'): RequestAccessResolver {
  return {
    workspacePermission: vi.fn(async () => permission),
    organizationRole: vi.fn(async () => null),
    workflow: vi.fn(async () => null),
  }
}

function organizationSnapshot(
  overrides: Partial<WorkspaceHostContextSnapshot> = {}
): WorkspaceHostContextSnapshot {
  return {
    workspace: {
      id: 'workspace-1',
      name: 'Runtime',
      workspaceMode: 'organization',
      billedAccountUserId: 'owner-1',
      organizationId: 'organization-host',
    },
    viewerOrganizationRole: null,
    subscription: {
      plan: 'enterprise',
      status: 'past_due',
      billingInterval: 'year',
      metadata: null,
    },
    billingBlocked: false,
    billingBlockedReason: null,
    ...overrides,
  }
}

function repository(
  snapshot: WorkspaceHostContextSnapshot | null = organizationSnapshot()
): WorkspaceHostContextReadRepository {
  return {
    readForViewer: vi.fn(async () => snapshot),
  }
}

function handler(
  options: { access?: RequestAccessResolver; repository?: WorkspaceHostContextReadRepository } = {}
) {
  return createGetWorkspaceHostContextHandler(
    createGetWorkspaceHostContextUseCase({
      access: options.access ?? access(),
      repository: options.repository ?? repository(),
    })
  )
}

function request(path = '/api/workspaces/workspace-1/host-context') {
  return new Request(`http://api.test${path}`)
}

describe('native workspace host context read', () => {
  it('uses the routed workspace host instead of the session active organization', async () => {
    const source = repository()
    const response = await handler({ repository: source })({
      request: request(),
      authenticationContext: sessionContext,
      requestId: 'request-1041',
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(workspaceHostContextV1Schema.parse(body)).toEqual(body)
    expect(body).toEqual({
      workspace: {
        id: 'workspace-1',
        name: 'Runtime',
        workspaceMode: 'organization',
        billedAccountUserId: 'owner-1',
      },
      hostOrganizationId: 'organization-host',
      ownerBilling: {
        plan: 'enterprise',
        status: 'past_due',
        isPaid: true,
        isPro: false,
        isTeam: false,
        isEnterprise: true,
        isOrgScoped: true,
        organizationId: 'organization-host',
        billingInterval: 'year',
        billingBlocked: false,
        billingBlockedReason: null,
      },
      viewer: {
        permission: 'read',
        isHostOrganizationMember: false,
        isHostOrganizationAdmin: false,
      },
    })
    expect(source.readForViewer).toHaveBeenCalledWith('workspace-1', 'external-1')
  })

  it('projects owning-organization membership and admin authority', async () => {
    const response = await handler({
      access: access('admin'),
      repository: repository(
        organizationSnapshot({
          viewerOrganizationRole: 'owner',
        })
      ),
    })({
      request: request(),
      authenticationContext: sessionContext,
      requestId: 'request-1041',
    })

    expect(response.status).toBe(200)
    expect((await response.json()).viewer).toEqual({
      permission: 'admin',
      isHostOrganizationMember: true,
      isHostOrganizationAdmin: true,
    })
  })

  it('uses the personal payer and disables paid flags while billing-blocked', async () => {
    const response = await handler({
      repository: repository({
        workspace: {
          id: 'workspace-personal',
          name: 'Personal',
          workspaceMode: 'personal',
          billedAccountUserId: 'payer-1',
          organizationId: null,
        },
        viewerOrganizationRole: null,
        subscription: {
          plan: 'pro_6000',
          status: 'active',
          billingInterval: null,
          metadata: { billingInterval: 'year' },
        },
        billingBlocked: true,
        billingBlockedReason: 'payment_failed',
      }),
    })({
      request: request('/api/workspaces/workspace-personal/host-context'),
      authenticationContext: sessionContext,
      requestId: 'request-1041',
    })

    expect(response.status).toBe(200)
    expect((await response.json()).ownerBilling).toEqual({
      plan: 'pro_6000',
      status: 'active',
      isPaid: false,
      isPro: false,
      isTeam: false,
      isEnterprise: false,
      isOrgScoped: false,
      organizationId: null,
      billingInterval: 'year',
      billingBlocked: true,
      billingBlockedReason: 'payment_failed',
    })
  })

  it('authenticates first and conceals missing, archived, and denied workspaces', async () => {
    const source = repository()
    const direct = handler({ repository: source })
    const unauthorized = await direct({
      request: request(),
      requestId: 'request-1041',
    })
    expect(unauthorized.status).toBe(401)
    expect(await unauthorized.json()).toEqual({ error: 'Unauthorized' })
    expect(source.readForViewer).not.toHaveBeenCalled()

    const denied = await handler({ access: access(null), repository: source })({
      request: request(),
      authenticationContext: sessionContext,
      requestId: 'request-1041',
    })
    expect(denied.status).toBe(403)
    expect(await denied.json()).toEqual({ error: 'Workspace access denied' })
    expect(source.readForViewer).not.toHaveBeenCalled()

    const missing = await handler({ repository: repository(null) })({
      request: request(),
      authenticationContext: sessionContext,
      requestId: 'request-1041',
    })
    expect(missing.status).toBe(403)
    expect(await missing.json()).toEqual({ error: 'Workspace access denied' })
  })

  it('preserves the generic request-id 500 envelope', async () => {
    const response = await handler({
      repository: {
        async readForViewer() {
          throw new Error('database unavailable')
        },
      },
    })({
      request: request(),
      authenticationContext: sessionContext,
      requestId: 'request-1041',
    })

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: 'Internal server error',
      requestId: 'request-1041',
    })
  })

  it('executes through session authentication and API-1041 native routing', async () => {
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
          nativeHandlers: { 'API-1041': handler() },
        }),
      }),
    })

    const response = await application.handle(
      new Request('http://api.test/api/workspaces/workspace-1/host-context', {
        headers: {
          cookie: 'session=valid',
          'x-request-id': 'request-1041',
        },
      })
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('x-sim-api-backend')).toBe('native')
    expect(response.headers.get('x-sim-api-inventory-id')).toBe('API-1041')
  })
})

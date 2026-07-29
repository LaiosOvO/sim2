import type { SessionRequestContext } from '@sim/api-contracts/auth'
import {
  defaultPermissionGroupConfigV1,
  getUserPermissionGroupResponseV1Schema,
} from '@sim/api-contracts/permission-groups'
import type { RequestAccessResolver } from '@sim/auth/authorization'
import { createRequestAuthenticator } from '@sim/auth/request-context'
import { describe, expect, it, vi } from 'vitest'
import { createApiApplication } from '@/bootstrap/application/create-api-application'
import type { OrganizationAccessControlEntitlementReader } from '@/modules/organizations'
import {
  createGetUserPermissionGroupHandler,
  createGetUserPermissionGroupUseCase,
  type UserPermissionGroupReadRepository,
} from '@/modules/permission-groups'
import { createRoutedTenantReadBackend } from '@/modules/tenant-read/application/create-routed-tenant-read-backend'
import { createTenantReadModule } from '@/modules/tenant-read/application/create-tenant-read-module'

const sessionContext: SessionRequestContext = {
  authContextVersion: 1,
  requestId: 'request-0243',
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

function access(
  options: { permission?: 'read' | 'write' | 'admin' | null; role?: string | null } = {}
) {
  return {
    workspacePermission: vi.fn(async () =>
      options.permission === undefined ? ('read' as const) : options.permission
    ),
    organizationRole: vi.fn(async () => options.role ?? null),
    workflow: vi.fn(async () => null),
  } satisfies RequestAccessResolver
}

function entitlement(entitled = true): OrganizationAccessControlEntitlementReader {
  return {
    isEntitled: vi.fn(async () => entitled),
  }
}

function repository(
  options: {
    organizationId?: string | null
    missing?: boolean
    resolved?: Awaited<ReturnType<UserPermissionGroupReadRepository['resolveForUser']>>
  } = {}
): UserPermissionGroupReadRepository {
  return {
    findActiveWorkspace: vi.fn(async () =>
      options.missing
        ? null
        : {
            organizationId:
              options.organizationId === undefined ? 'organization-1' : options.organizationId,
          }
    ),
    resolveForUser: vi.fn(async () =>
      options.resolved === undefined
        ? {
            permissionGroupId: 'group-1',
            groupName: 'Restricted',
            config: {
              disableSkills: true,
              deniedModels: ['gpt-4o', 42],
              allowedFileShareAuthTypes: ['password', 'invalid'],
            },
          }
        : options.resolved
    ),
  }
}

function handler(
  options: {
    access?: RequestAccessResolver
    entitled?: boolean
    entitlement?: OrganizationAccessControlEntitlementReader
    repository?: UserPermissionGroupReadRepository
  } = {}
) {
  return createGetUserPermissionGroupHandler(
    createGetUserPermissionGroupUseCase({
      access: options.access ?? access(),
      entitlement: options.entitlement ?? entitlement(options.entitled),
      repository: options.repository ?? repository(),
    })
  )
}

function request(url = 'http://api.test/api/permission-groups/user?workspaceId=workspace-1') {
  return new Request(url)
}

describe('native user permission group read', () => {
  it('returns the normalized group for the workspace owning organization', async () => {
    const source = repository()
    const resolver = access()
    const response = await handler({ access: resolver, repository: source })({
      request: request(),
      authenticationContext: sessionContext,
      requestId: 'request-0243',
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(getUserPermissionGroupResponseV1Schema.parse(body)).toEqual(body)
    expect(body).toMatchObject({
      permissionGroupId: 'group-1',
      groupName: 'Restricted',
      entitled: true,
      organizationId: 'organization-1',
      isOrgAdmin: false,
      config: {
        ...defaultPermissionGroupConfigV1,
        deniedModels: ['gpt-4o'],
        disableSkills: true,
        allowedFileShareAuthTypes: ['password'],
      },
    })
    expect(source.resolveForUser).toHaveBeenCalledWith(
      'external-1',
      'organization-1',
      'workspace-1'
    )
    expect(resolver.organizationRole).toHaveBeenCalledWith('external-1', 'organization-1')
    expect(resolver.organizationRole).not.toHaveBeenCalledWith(
      'external-1',
      'wrong-active-organization'
    )
  })

  it('short-circuits personal workspaces before organization or entitlement reads', async () => {
    const source = repository({ organizationId: null })
    const resolver = access()
    const entitlementReader = entitlement()
    const response = await handler({
      access: resolver,
      entitlement: entitlementReader,
      repository: source,
    })({
      request: request(),
      authenticationContext: sessionContext,
      requestId: 'request-0243',
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      permissionGroupId: null,
      groupName: null,
      config: null,
      entitled: false,
      organizationId: null,
      isOrgAdmin: false,
    })
    expect(resolver.organizationRole).not.toHaveBeenCalled()
    expect(entitlementReader.isEntitled).not.toHaveBeenCalled()
    expect(source.resolveForUser).not.toHaveBeenCalled()
  })

  it('returns owning-organization admin metadata but skips groups when not entitled', async () => {
    const source = repository()
    const response = await handler({
      access: access({ role: 'owner' }),
      entitled: false,
      repository: source,
    })({
      request: request(),
      authenticationContext: sessionContext,
      requestId: 'request-0243',
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      permissionGroupId: null,
      groupName: null,
      config: null,
      entitled: false,
      organizationId: 'organization-1',
      isOrgAdmin: true,
    })
    expect(source.resolveForUser).not.toHaveBeenCalled()
  })

  it('preserves auth, query, missing-workspace, and membership error ordering', async () => {
    const source = repository()
    const direct = handler({ repository: source })
    const unauthorized = await direct({ request: request(), requestId: 'request-0243' })
    expect(unauthorized.status).toBe(401)
    expect(await unauthorized.json()).toEqual({ error: 'Unauthorized' })

    const invalid = await direct({
      request: request('http://api.test/api/permission-groups/user'),
      authenticationContext: sessionContext,
      requestId: 'request-0243',
    })
    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toEqual({ error: 'workspaceId is required' })
    expect(source.findActiveWorkspace).not.toHaveBeenCalled()

    const missing = await handler({ repository: repository({ missing: true }) })({
      request: request(),
      authenticationContext: sessionContext,
      requestId: 'request-0243',
    })
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({ error: 'Workspace not found' })

    const deniedSource = repository()
    const denied = await handler({
      access: access({ permission: null }),
      repository: deniedSource,
    })({
      request: request(),
      authenticationContext: sessionContext,
      requestId: 'request-0243',
    })
    expect(denied.status).toBe(403)
    expect(await denied.json()).toEqual({ error: 'Not a member of this workspace' })
    expect(deniedSource.resolveForUser).not.toHaveBeenCalled()
  })

  it('preserves the generic request-id 500 envelope', async () => {
    const response = await handler({
      access: {
        ...access(),
        async workspacePermission() {
          throw new Error('database unavailable')
        },
      },
    })({
      request: request(),
      authenticationContext: sessionContext,
      requestId: 'request-0243',
    })

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: 'Internal server error',
      requestId: 'request-0243',
    })
  })

  it('executes through session authentication and API-0243 native routing', async () => {
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
          nativeHandlers: { 'API-0243': handler() },
        }),
      }),
    })

    const response = await application.handle(
      new Request('http://api.test/api/permission-groups/user?workspaceId=workspace-1', {
        headers: {
          cookie: 'session=valid',
          'x-request-id': 'request-0243',
        },
      })
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('x-sim-api-backend')).toBe('native')
    expect(response.headers.get('x-sim-api-inventory-id')).toBe('API-0243')
  })
})

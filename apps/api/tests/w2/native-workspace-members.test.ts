import type { SessionRequestContext } from '@sim/api-contracts/auth'
import { listWorkspaceMembersResponseV1Schema } from '@sim/api-contracts/workspaces'
import type { RequestAccessResolver } from '@sim/auth/authorization'
import { createRequestAuthenticator } from '@sim/auth/request-context'
import { describe, expect, it, vi } from 'vitest'
import { createApiApplication } from '@/bootstrap/application/create-api-application'
import { createRoutedTenantReadBackend } from '@/modules/tenant-read/application/create-routed-tenant-read-backend'
import { createTenantReadModule } from '@/modules/tenant-read/application/create-tenant-read-module'
import {
  createListWorkspaceMembersHandler,
  createListWorkspaceMembersUseCase,
  type WorkspaceMemberReadRepository,
} from '@/modules/workspaces'

const sessionContext: SessionRequestContext = {
  authContextVersion: 1,
  requestId: 'request-1',
  authenticationMethod: 'session',
  actor: {
    id: 'viewer-1',
    type: 'user',
    name: 'Viewer',
    email: 'viewer@example.com',
  },
  credentialId: 'session-1',
  activeOrganizationId: 'organization-1',
  permissions: [],
}

const normalizedLegacyFixture = {
  members: [
    { userId: 'user-1', name: 'Ada', image: null },
    { userId: 'user-2', name: 'Grace', image: 'https://cdn.test/grace.png' },
  ],
}

function accessResolver(
  workspacePermission: RequestAccessResolver['workspacePermission'] = async (
    _actorId,
    workspaceId
  ) => (workspaceId === 'workspace-1' ? 'read' : null)
): RequestAccessResolver {
  return {
    workspacePermission: vi.fn(workspacePermission),
    organizationRole: vi.fn(async () => null),
    workflow: vi.fn(async () => null),
  }
}

function repository(): WorkspaceMemberReadRepository {
  return {
    listActiveMembers: vi.fn(async () => normalizedLegacyFixture.members),
  }
}

describe('native workspace member read', () => {
  it('matches the normalized lightweight legacy response', async () => {
    const members = repository()
    const handler = createListWorkspaceMembersHandler(
      createListWorkspaceMembersUseCase({
        access: accessResolver(),
        repository: members,
      })
    )

    const response = await handler({
      request: new Request('http://api.test/api/workspaces/workspace-1/members'),
      authenticationContext: sessionContext,
      requestId: 'request-1',
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual(normalizedLegacyFixture)
    expect(listWorkspaceMembersResponseV1Schema.parse(body)).toEqual(normalizedLegacyFixture)
    expect(members.listActiveMembers).toHaveBeenCalledWith('workspace-1')
  })

  it('conceals missing, archived, and cross-workspace access behind the legacy 404', async () => {
    const members = repository()
    const access = accessResolver()
    const handler = createListWorkspaceMembersHandler(
      createListWorkspaceMembersUseCase({ access, repository: members })
    )

    const response = await handler({
      request: new Request('http://api.test/api/workspaces/workspace-2/members'),
      authenticationContext: sessionContext,
      requestId: 'request-1',
    })

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: 'Workspace not found or access denied',
    })
    expect(access.workspacePermission).toHaveBeenCalledWith('viewer-1', 'workspace-2')
    expect(members.listActiveMembers).not.toHaveBeenCalled()
  })

  it('requires the session context even when the handler is invoked directly', async () => {
    const members = repository()
    const handler = createListWorkspaceMembersHandler(
      createListWorkspaceMembersUseCase({
        access: accessResolver(),
        repository: members,
      })
    )

    const response = await handler({
      request: new Request('http://api.test/api/workspaces/workspace-1/members'),
      requestId: 'request-1',
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Authentication required' })
    expect(members.listActiveMembers).not.toHaveBeenCalled()
  })

  it('preserves the legacy 500 response when authorization or repository access fails', async () => {
    const handler = createListWorkspaceMembersHandler(
      createListWorkspaceMembersUseCase({
        access: accessResolver(async () => {
          throw new Error('database unavailable')
        }),
        repository: repository(),
      })
    )

    const response = await handler({
      request: new Request('http://api.test/api/workspaces/workspace-1/members'),
      authenticationContext: sessionContext,
      requestId: 'request-1',
    })

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Failed to fetch workspace members' })
  })

  it('executes through session authentication, W2 routing, and tenant authorization', async () => {
    const members = repository()
    const access = accessResolver()
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
    const nativeHandler = createListWorkspaceMembersHandler(
      createListWorkspaceMembersUseCase({ access, repository: members })
    )
    const application = createApiApplication({
      tenantRead: createTenantReadModule({
        authentication,
        backend: createRoutedTenantReadBackend({
          fallback: {
            async forward() {
              throw new Error('must not use legacy')
            },
          },
          nativeHandlers: { 'API-1057': nativeHandler },
        }),
      }),
    })

    const response = await application.handle(
      new Request('http://api.test/api/workspaces/workspace-1/members', {
        headers: { cookie: 'session=valid', 'x-request-id': 'request-1' },
      })
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('x-sim-api-backend')).toBe('native')
    expect(response.headers.get('x-sim-api-inventory-id')).toBe('API-1057')
    expect(await response.json()).toEqual(normalizedLegacyFixture)
    expect(access.workspacePermission).toHaveBeenCalledWith('viewer-1', 'workspace-1')
  })
})

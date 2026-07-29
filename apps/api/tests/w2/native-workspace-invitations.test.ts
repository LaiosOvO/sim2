import type { SessionRequestContext } from '@sim/api-contracts/auth'
import { listWorkspaceInvitationsResponseV1Schema } from '@sim/api-contracts/invitations'
import { createRequestAuthenticator } from '@sim/auth/request-context'
import { describe, expect, it, vi } from 'vitest'
import { createApiApplication } from '@/bootstrap/application/create-api-application'
import {
  createListWorkspaceInvitationsHandler,
  createListWorkspaceInvitationsUseCase,
  type WorkspaceInvitationReadRepository,
  type WorkspaceInvitationRecord,
} from '@/modules/invitations'
import { createRoutedTenantReadBackend } from '@/modules/tenant-read/application/create-routed-tenant-read-backend'
import { createTenantReadModule } from '@/modules/tenant-read/application/create-tenant-read-module'

const sessionContext: SessionRequestContext = {
  authContextVersion: 1,
  requestId: 'request-1124',
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

const invitationRecord: WorkspaceInvitationRecord = {
  id: 'invitation-1',
  kind: 'workspace',
  email: 'invitee@example.com',
  token: 'legacy-management-token',
  status: 'pending',
  expiresAt: new Date('2026-08-06T00:00:00.000Z'),
  createdAt: new Date('2026-07-30T00:00:00.000Z'),
  updatedAt: new Date('2026-07-31T00:00:00.000Z'),
  organizationId: 'organization-1',
  membershipIntent: 'external',
  inviterId: 'viewer-1',
  workspaceId: 'workspace-1',
  permission: 'write',
}

const legacyFixture = {
  invitations: [
    {
      id: 'invitation-1',
      kind: 'workspace',
      email: 'invitee@example.com',
      token: 'legacy-management-token',
      status: 'pending',
      expiresAt: '2026-08-06T00:00:00.000Z',
      createdAt: '2026-07-30T00:00:00.000Z',
      updatedAt: '2026-07-31T00:00:00.000Z',
      organizationId: 'organization-1',
      membershipIntent: 'external',
      inviterId: 'viewer-1',
      workspaceId: 'workspace-1',
      permission: 'write',
    },
  ],
}

function repository(
  records: readonly WorkspaceInvitationRecord[] = [invitationRecord]
): WorkspaceInvitationReadRepository {
  return {
    listForAccessibleWorkspaces: vi.fn(async () => records),
  }
}

describe('native workspace invitation management read', () => {
  it('matches the legacy management-list wire and preserves its intentional token field', async () => {
    const source = repository()
    const response = await createListWorkspaceInvitationsHandler(
      createListWorkspaceInvitationsUseCase(source)
    )({
      authenticationContext: sessionContext,
      requestId: 'request-1124',
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual(legacyFixture)
    expect(listWorkspaceInvitationsResponseV1Schema.parse(body)).toEqual(legacyFixture)
    expect(source.listForAccessibleWorkspaces).toHaveBeenCalledWith('viewer-1')
  })

  it('returns the legacy unauthorized envelope without calling the repository', async () => {
    const source = repository()
    const response = await createListWorkspaceInvitationsHandler(
      createListWorkspaceInvitationsUseCase(source)
    )({
      requestId: 'request-1124',
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(source.listForAccessibleWorkspaces).not.toHaveBeenCalled()
  })

  it('returns the legacy error envelope when the query fails', async () => {
    const response = await createListWorkspaceInvitationsHandler(
      createListWorkspaceInvitationsUseCase({
        async listForAccessibleWorkspaces() {
          throw new Error('database unavailable')
        },
      })
    )({
      authenticationContext: sessionContext,
      requestId: 'request-1124',
    })

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Failed to fetch invitations' })
  })

  it('executes through session authentication and API-1124 native routing', async () => {
    const source = repository()
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
    const nativeHandler = createListWorkspaceInvitationsHandler(
      createListWorkspaceInvitationsUseCase(source)
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
          nativeHandlers: { 'API-1124': nativeHandler },
        }),
      }),
    })

    const response = await application.handle(
      new Request('http://api.test/api/workspaces/invitations', {
        headers: {
          cookie: 'session=valid',
          'x-request-id': 'request-1124',
        },
      })
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('x-sim-api-backend')).toBe('native')
    expect(response.headers.get('x-sim-api-inventory-id')).toBe('API-1124')
    expect(await response.json()).toEqual(legacyFixture)
  })
})

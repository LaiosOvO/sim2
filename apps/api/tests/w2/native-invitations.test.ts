import type { SessionRequestContext } from '@sim/api-contracts/auth'
import { listMyInvitationsResponseV1Schema } from '@sim/api-contracts/invitations'
import { createRequestAuthenticator } from '@sim/auth/request-context'
import { describe, expect, it, vi } from 'vitest'
import { createApiApplication } from '@/bootstrap/application/create-api-application'
import {
  createListMyInvitationsHandler,
  createListMyInvitationsUseCase,
  type InvitationReadRepository,
  type PendingInvitationRecord,
} from '@/modules/invitations'
import { createRoutedTenantReadBackend } from '@/modules/tenant-read/application/create-routed-tenant-read-backend'
import { createTenantReadModule } from '@/modules/tenant-read/application/create-tenant-read-module'

const sessionContext: SessionRequestContext = {
  authContextVersion: 1,
  requestId: 'request-1',
  authenticationMethod: 'session',
  actor: {
    id: 'user-1',
    type: 'user',
    name: 'Ada',
    email: 'ada@example.com',
  },
  credentialId: 'session-1',
  activeOrganizationId: 'organization-1',
  permissions: [],
}

const invitationRecord: PendingInvitationRecord = {
  id: 'invitation-1',
  kind: 'workspace',
  email: 'ada@example.com',
  organizationId: 'organization-1',
  organizationName: 'Platform',
  membershipIntent: 'external',
  role: 'member',
  status: 'pending',
  expiresAt: new Date('2026-08-01T00:00:00.000Z'),
  createdAt: new Date('2026-07-30T00:00:00.000Z'),
  inviterName: 'Grace',
  inviterEmail: 'grace@example.com',
  grants: [
    {
      workspaceId: 'workspace-1',
      workspaceName: 'Runtime',
      permission: 'write',
    },
  ],
}

const normalizedLegacyFixture = {
  invitations: [
    {
      id: 'invitation-1',
      kind: 'workspace',
      email: 'ada@example.com',
      organizationId: 'organization-1',
      organizationName: 'Platform',
      membershipIntent: 'external',
      role: 'member',
      status: 'pending',
      expiresAt: '2026-08-01T00:00:00.000Z',
      createdAt: '2026-07-30T00:00:00.000Z',
      inviterName: 'Grace',
      inviterEmail: 'grace@example.com',
      grants: [
        {
          workspaceId: 'workspace-1',
          workspaceName: 'Runtime',
          permission: 'write',
        },
      ],
    },
  ],
}

function repository(
  records: readonly PendingInvitationRecord[] = [invitationRecord]
): InvitationReadRepository {
  return {
    listPendingForEmail: vi.fn(async () => records),
  }
}

describe('native invitee invitation read', () => {
  it('matches the normalized legacy response and never emits an acceptance token', async () => {
    const source = repository([
      {
        ...invitationRecord,
        // Deliberately simulate a wider persistence row at runtime. The
        // application mapping must only emit the token-free contract fields.
        token: 'server-only-token',
      } as PendingInvitationRecord,
    ])
    const handler = createListMyInvitationsHandler(createListMyInvitationsUseCase(source))

    const response = await handler({
      authenticationContext: sessionContext,
      requestId: 'request-1',
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual(normalizedLegacyFixture)
    expect(listMyInvitationsResponseV1Schema.parse(body)).toEqual(normalizedLegacyFixture)
    expect(JSON.stringify(body)).not.toContain('server-only-token')
    expect(source.listPendingForEmail).toHaveBeenCalledWith('ada@example.com')
  })

  it('fails closed when a session context has no email', async () => {
    const source = repository()
    const handler = createListMyInvitationsHandler(createListMyInvitationsUseCase(source))

    const response = await handler({
      authenticationContext: {
        ...sessionContext,
        actor: { id: 'user-1', type: 'user' },
      },
      requestId: 'request-1',
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(source.listPendingForEmail).not.toHaveBeenCalled()
  })

  it('preserves the legacy error envelope when the repository fails', async () => {
    const handler = createListMyInvitationsHandler(
      createListMyInvitationsUseCase({
        async listPendingForEmail() {
          throw new Error('database unavailable')
        },
      })
    )

    const response = await handler({
      authenticationContext: sessionContext,
      requestId: 'request-1',
    })

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Failed to list invitations' })
  })

  it('executes through session authentication, W2 routing, and the native module', async () => {
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
    const nativeHandler = createListMyInvitationsHandler(createListMyInvitationsUseCase(source))
    const application = createApiApplication({
      tenantRead: createTenantReadModule({
        authentication,
        backend: createRoutedTenantReadBackend({
          fallback: {
            async forward() {
              throw new Error('must not use legacy')
            },
          },
          nativeHandlers: { 'API-0137': nativeHandler },
        }),
      }),
    })

    const response = await application.handle(
      new Request('http://api.test/api/invitations', {
        headers: { cookie: 'session=valid', 'x-request-id': 'request-1' },
      })
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('x-sim-api-backend')).toBe('native')
    expect(response.headers.get('x-sim-api-inventory-id')).toBe('API-0137')
    expect(await response.json()).toEqual(normalizedLegacyFixture)
  })
})

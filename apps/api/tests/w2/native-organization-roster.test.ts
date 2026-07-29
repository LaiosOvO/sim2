import type { SessionRequestContext } from '@sim/api-contracts/auth'
import { getOrganizationRosterResponseV1Schema } from '@sim/api-contracts/organizations'
import type { RequestAccessResolver } from '@sim/auth/authorization'
import { createRequestAuthenticator } from '@sim/auth/request-context'
import { describe, expect, it, vi } from 'vitest'
import { createApiApplication } from '@/bootstrap/application/create-api-application'
import {
  createListOrganizationRosterHandler,
  createListOrganizationRosterUseCase,
  type OrganizationAdminRosterSnapshot,
  type OrganizationInvitationHousekeeping,
  type OrganizationRosterReadRepository,
} from '@/modules/organizations'
import { createRoutedTenantReadBackend } from '@/modules/tenant-read/application/create-routed-tenant-read-backend'
import { createTenantReadModule } from '@/modules/tenant-read/application/create-tenant-read-module'

const sessionContext: SessionRequestContext = {
  authContextVersion: 1,
  requestId: 'request-0235',
  authenticationMethod: 'session',
  actor: {
    id: 'caller-1',
    type: 'user',
    name: 'Caller',
    email: 'caller@example.com',
  },
  credentialId: 'session-1',
  activeOrganizationId: 'organization-1',
  permissions: [],
}

const memberRecords = [
  {
    memberId: 'membership-owner',
    userId: 'owner-1',
    role: 'owner',
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    name: 'Owner',
    email: 'owner@example.com',
    image: null,
  },
  {
    memberId: 'membership-member',
    userId: 'member-1',
    role: 'member',
    createdAt: new Date('2026-07-02T00:00:00.000Z'),
    name: 'Member',
    email: 'member@example.com',
    image: 'https://cdn.test/member.png',
  },
]

const adminSnapshot: OrganizationAdminRosterSnapshot = {
  members: memberRecords,
  workspaces: [
    { id: 'workspace-1', name: 'Runtime' },
    { id: 'workspace-2', name: 'Operations' },
  ],
  permissions: [
    {
      userId: 'member-1',
      userName: 'Member',
      userEmail: 'member@example.com',
      userImage: 'https://cdn.test/member.png',
      workspaceId: 'workspace-2',
      permission: 'read',
      createdAt: new Date('2026-07-05T00:00:00.000Z'),
    },
    {
      userId: 'external-1',
      userName: 'External',
      userEmail: 'external@example.com',
      userImage: null,
      workspaceId: 'workspace-1',
      permission: 'read',
      createdAt: new Date('2026-07-10T00:00:00.000Z'),
    },
    {
      userId: 'external-1',
      userName: 'External',
      userEmail: 'external@example.com',
      userImage: null,
      workspaceId: 'workspace-2',
      permission: 'write',
      createdAt: new Date('2026-07-03T00:00:00.000Z'),
    },
  ],
  pendingInvitations: [
    {
      id: 'invitation-1',
      email: 'invitee@example.com',
      role: 'member',
      kind: 'workspace',
      membershipIntent: 'external',
      createdAt: new Date('2026-07-20T00:00:00.000Z'),
      expiresAt: new Date('2026-08-20T00:00:00.000Z'),
      inviteeName: 'Invitee',
      inviteeImage: null,
    },
  ],
  invitationGrants: [
    {
      invitationId: 'invitation-1',
      workspaceId: 'workspace-1',
      permission: 'write',
    },
  ],
}

function access(role: string | null): RequestAccessResolver {
  return {
    workspacePermission: vi.fn(async () => null),
    organizationRole: vi.fn(async () => role),
    workflow: vi.fn(async () => null),
  }
}

function repository(): OrganizationRosterReadRepository {
  return {
    listMembers: vi.fn(async () => memberRecords),
    loadAdminSnapshot: vi.fn(async () => adminSnapshot),
  }
}

function housekeeping(): OrganizationInvitationHousekeeping {
  return {
    expireStalePending: vi.fn(async () => undefined),
  }
}

function handler(
  options: {
    role?: string | null
    repository?: OrganizationRosterReadRepository
    housekeeping?: OrganizationInvitationHousekeeping
    access?: RequestAccessResolver
  } = {}
) {
  return createListOrganizationRosterHandler(
    createListOrganizationRosterUseCase({
      access: options.access ?? access(options.role === undefined ? 'admin' : options.role),
      housekeeping: options.housekeeping ?? housekeeping(),
      repository: options.repository ?? repository(),
    })
  )
}

describe('native organization roster read', () => {
  it('returns the redacted member projection without admin reads or housekeeping', async () => {
    const source = repository()
    const cleanup = housekeeping()
    const response = await handler({
      role: 'member',
      repository: source,
      housekeeping: cleanup,
    })({
      request: new Request('http://api.test/api/organizations/organization-1/roster'),
      authenticationContext: sessionContext,
      requestId: 'request-0235',
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      success: true,
      data: {
        members: [
          {
            memberId: 'membership-owner',
            userId: 'owner-1',
            role: 'owner',
            createdAt: '2026-07-01T00:00:00.000Z',
            name: 'Owner',
            email: 'owner@example.com',
            image: null,
            workspaces: [],
          },
          {
            memberId: 'membership-member',
            userId: 'member-1',
            role: 'member',
            createdAt: '2026-07-02T00:00:00.000Z',
            name: 'Member',
            email: 'member@example.com',
            image: 'https://cdn.test/member.png',
            workspaces: [],
          },
        ],
        pendingInvitations: [],
        workspaces: [],
      },
    })
    expect(source.loadAdminSnapshot).not.toHaveBeenCalled()
    expect(cleanup.expireStalePending).not.toHaveBeenCalled()
  })

  it('builds the admin projection, derives admin access, and groups external members', async () => {
    const cleanup = housekeeping()
    const response = await handler({ housekeeping: cleanup })({
      request: new Request('http://api.test/api/organizations/organization-1/roster'),
      authenticationContext: sessionContext,
      requestId: 'request-0235',
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(getOrganizationRosterResponseV1Schema.parse(body)).toEqual(body)
    expect(body.data.members).toEqual([
      {
        memberId: 'membership-owner',
        userId: 'owner-1',
        role: 'owner',
        createdAt: '2026-07-01T00:00:00.000Z',
        name: 'Owner',
        email: 'owner@example.com',
        image: null,
        workspaces: [
          { workspaceId: 'workspace-1', workspaceName: 'Runtime', permission: 'admin' },
          { workspaceId: 'workspace-2', workspaceName: 'Operations', permission: 'admin' },
        ],
      },
      {
        memberId: 'membership-member',
        userId: 'member-1',
        role: 'member',
        createdAt: '2026-07-02T00:00:00.000Z',
        name: 'Member',
        email: 'member@example.com',
        image: 'https://cdn.test/member.png',
        workspaces: [
          { workspaceId: 'workspace-2', workspaceName: 'Operations', permission: 'read' },
        ],
      },
      {
        memberId: 'external-external-1',
        userId: 'external-1',
        role: 'external',
        createdAt: '2026-07-03T00:00:00.000Z',
        name: 'External',
        email: 'external@example.com',
        image: null,
        workspaces: [
          { workspaceId: 'workspace-1', workspaceName: 'Runtime', permission: 'read' },
          { workspaceId: 'workspace-2', workspaceName: 'Operations', permission: 'write' },
        ],
      },
    ])
    expect(body.data.pendingInvitations).toEqual([
      {
        id: 'invitation-1',
        email: 'invitee@example.com',
        role: 'external',
        kind: 'workspace',
        membershipIntent: 'external',
        createdAt: '2026-07-20T00:00:00.000Z',
        expiresAt: '2026-08-20T00:00:00.000Z',
        inviteeName: 'Invitee',
        inviteeImage: null,
        workspaces: [{ workspaceId: 'workspace-1', workspaceName: 'Runtime', permission: 'write' }],
      },
    ])
    expect(cleanup.expireStalePending).toHaveBeenCalledWith('organization-1')
  })

  it('keeps the admin read available when best-effort housekeeping fails', async () => {
    const response = await handler({
      housekeeping: {
        async expireStalePending() {
          throw new Error('cleanup unavailable')
        },
      },
    })({
      request: new Request('http://api.test/api/organizations/organization-1/roster'),
      authenticationContext: sessionContext,
      requestId: 'request-0235',
    })

    expect(response.status).toBe(200)
    expect((await response.json()).data.members).toHaveLength(3)
  })

  it('requires a session and target-organization membership before reads', async () => {
    const source = repository()
    const direct = handler({ role: null, repository: source })
    const unauthorized = await direct({
      request: new Request('http://api.test/api/organizations/organization-1/roster'),
      requestId: 'request-0235',
    })
    expect(unauthorized.status).toBe(401)
    expect(await unauthorized.json()).toEqual({ error: 'Unauthorized' })

    const forbidden = await direct({
      request: new Request('http://api.test/api/organizations/organization-1/roster'),
      authenticationContext: sessionContext,
      requestId: 'request-0235',
    })
    expect(forbidden.status).toBe(403)
    expect(await forbidden.json()).toEqual({
      error: 'Forbidden - Not a member of this organization',
    })
    expect(source.listMembers).not.toHaveBeenCalled()
    expect(source.loadAdminSnapshot).not.toHaveBeenCalled()
  })

  it('preserves invalid-path and generic legacy error envelopes', async () => {
    const invalid = await handler()({
      request: new Request('http://api.test/api/organizations/%E0%A4%A/roster'),
      authenticationContext: sessionContext,
      requestId: 'request-0235',
    })
    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toEqual({ error: 'Invalid route parameters' })

    const failed = await handler({
      access: {
        ...access('admin'),
        async organizationRole() {
          throw new Error('database unavailable')
        },
      },
    })({
      request: new Request('http://api.test/api/organizations/organization-1/roster'),
      authenticationContext: sessionContext,
      requestId: 'request-0235',
    })
    expect(failed.status).toBe(500)
    expect(await failed.json()).toEqual({ error: 'Failed to fetch organization roster' })
  })

  it('executes through session authentication and API-0235 native routing', async () => {
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
          nativeHandlers: { 'API-0235': handler() },
        }),
      }),
    })

    const response = await application.handle(
      new Request('http://api.test/api/organizations/organization-1/roster', {
        headers: {
          cookie: 'session=valid',
          'x-request-id': 'request-0235',
        },
      })
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('x-sim-api-backend')).toBe('native')
    expect(response.headers.get('x-sim-api-inventory-id')).toBe('API-0235')
  })
})

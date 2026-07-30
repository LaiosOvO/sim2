import { describe, expect, it } from 'vitest'
import { authenticatedRequestContextSchema, requestAuthenticationResultSchema } from '../src/auth'
import {
  listDataDrainRunsQueryV1Schema,
  listDataDrainRunsResponseV1Schema,
} from '../src/data-drains'
import { apiErrorEnvelopeSchema } from '../src/errors'
import {
  listMyInvitationsResponseV1Schema,
  listWorkspaceInvitationsResponseV1Schema,
} from '../src/invitations'
import {
  getOrganizationRosterResponseV1Schema,
  listOrganizationWorkspacesResponseV1Schema,
} from '../src/organizations'
import { pageRequestSchema } from '../src/pagination'
import {
  getUserPermissionGroupResponseV1Schema,
  normalizePermissionGroupConfigV1,
} from '../src/permission-groups'
import { traceContextSchema } from '../src/tracing'
import { w2TenantReadRouteContractSchema, w2TenantReadRouteContracts } from '../src/w2-tenant-read'
import {
  listWorkspaceMembersResponseV1Schema,
  personalProfileResponseV1Schema,
  workspaceExecutionMetricsQueryV1Schema,
  workspaceExecutionMetricsResponseV1Schema,
  workspaceHostContextV1Schema,
} from '../src/workspaces'

describe('API contract compatibility', () => {
  it('accepts omitted and nullable error details', () => {
    const withoutDetails = apiErrorEnvelopeSchema.parse({
      contractVersion: 1,
      error: {
        code: 'not_found',
        message: 'Missing',
        status: 404,
        retryable: false,
      },
    })
    const nullDetails = apiErrorEnvelopeSchema.parse({
      ...withoutDetails,
      error: { ...withoutDetails.error, details: null },
    })

    expect(withoutDetails.error.details).toBeUndefined()
    expect(nullDetails.error.details).toBeNull()
  })

  it('strips additive unknown fields while preserving known wire fields', () => {
    const parsed = traceContextSchema.parse({
      traceId: '1'.repeat(32),
      spanId: '2'.repeat(16),
      traceFlags: '01',
      correlationId: 'request-1',
      futureField: 'safe-to-ignore',
    })

    expect(parsed).not.toHaveProperty('futureField')
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(parsed)
  })

  it('applies a bounded default page size', () => {
    expect(pageRequestSchema.parse({})).toEqual({ limit: 50 })
    expect(() => pageRequestSchema.parse({ limit: 201 })).toThrow()
  })

  it('keeps all four authentication contexts wire-safe and rejects plaintext secrets', () => {
    const contexts = [
      {
        authContextVersion: 1,
        requestId: 'request-session',
        authenticationMethod: 'session',
        actor: { id: 'user-1', type: 'user', email: 'ada@example.com' },
        credentialId: 'session-1',
        activeOrganizationId: 'org-1',
        permissions: [],
      },
      {
        authContextVersion: 1,
        requestId: 'request-key',
        authenticationMethod: 'api-key',
        actor: { id: 'user-1', type: 'user' },
        credentialId: 'key-1',
        keyType: 'workspace',
        workspaceId: 'workspace-1',
        permissions: ['workspace:read'],
      },
      {
        authContextVersion: 1,
        requestId: 'request-public',
        authenticationMethod: 'public-token',
        actor: { id: 'public-share:share-1', type: 'public' },
        credentialId: 'share-1',
        workspaceId: 'workspace-1',
        organizationId: null,
        resourceType: 'file',
        resourceId: 'file-1',
        permissions: ['resource:read'],
      },
      {
        authContextVersion: 1,
        requestId: 'request-internal',
        authenticationMethod: 'internal',
        actor: { id: 'executor', type: 'service' },
        service: 'executor',
        scopes: ['workflow:execute'],
        permissions: ['workflow:execute'],
      },
    ]

    for (const context of contexts) {
      const parsed = authenticatedRequestContextSchema.parse(context)
      expect(JSON.parse(JSON.stringify(parsed))).toEqual(parsed)
      expect(parsed).not.toHaveProperty('token')
      expect(parsed).not.toHaveProperty('apiKey')
    }
  })

  it('defines stable authentication failure responses', () => {
    expect(
      requestAuthenticationResultSchema.parse({
        ok: false,
        error: {
          code: 'revoked_credentials',
          message: 'Invalid credentials',
          status: 401,
          retryable: false,
        },
      })
    ).toEqual({
      ok: false,
      error: {
        code: 'revoked_credentials',
        message: 'Invalid credentials',
        status: 401,
        retryable: false,
      },
    })
  })

  it('freezes the exact W2 tenant-read route set and test obligations', () => {
    expect(w2TenantReadRouteContracts).toHaveLength(22)
    expect(new Set(w2TenantReadRouteContracts.map((route) => route.inventoryId)).size).toBe(22)
    expect(
      w2TenantReadRouteContracts
        .filter((route) => route.backend === 'native')
        .map((route) => route.inventoryId)
    ).toEqual([
      'API-0137',
      'API-0209',
      'API-0235',
      'API-0241',
      'API-0243',
      'API-0294',
      'API-1009',
      'API-1031',
      'API-1034',
      'API-1037',
      'API-1041',
      'API-1057',
      'API-1058',
      'API-1060',
      'API-1124',
    ])
    for (const route of w2TenantReadRouteContracts) {
      expect(w2TenantReadRouteContractSchema.parse(route).requiredTests).toEqual([
        'contract',
        'auth',
        'differential',
        'integration',
      ])
    }
  })

  it('keeps invitation acceptance tokens outside the invitee read contract', () => {
    const parsed = listMyInvitationsResponseV1Schema.parse({
      invitations: [
        {
          id: 'invitation-1',
          kind: 'workspace',
          email: 'ada@example.com',
          organizationId: null,
          organizationName: null,
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
              workspaceName: 'Platform',
              permission: 'write',
            },
          ],
          token: 'must-not-cross-the-contract',
        },
      ],
    })

    expect(parsed.invitations[0]).not.toHaveProperty('token')
  })

  it('defines bounded data-drain run pagination and strips persistence-only fields', () => {
    expect(listDataDrainRunsQueryV1Schema.parse({})).toEqual({ limit: 25 })
    expect(listDataDrainRunsQueryV1Schema.parse({ limit: '200' })).toEqual({ limit: 200 })
    expect(() => listDataDrainRunsQueryV1Schema.parse({ limit: '201' })).toThrow()

    const parsed = listDataDrainRunsResponseV1Schema.parse({
      runs: [
        {
          id: 'run-1',
          drainId: 'drain-1',
          status: 'success',
          trigger: 'cron',
          startedAt: '2026-07-30T00:00:00.000Z',
          finishedAt: null,
          rowsExported: 10,
          bytesWritten: 100,
          cursorBefore: null,
          cursorAfter: 'cursor-1',
          error: null,
          locators: ['s3://bucket/key'],
          destinationCredentials: 'must-not-cross-the-contract',
        },
      ],
    })
    expect(parsed.runs[0]).not.toHaveProperty('destinationCredentials')
  })

  it('keeps the existing token only in the workspace invitation management contract', () => {
    const parsed = listWorkspaceInvitationsResponseV1Schema.parse({
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
          inviterId: 'user-1',
          workspaceId: 'workspace-1',
          permission: 'write',
          rawSecret: 'must-be-stripped',
        },
      ],
    })

    expect(parsed.invitations[0]?.token).toBe('legacy-management-token')
    expect(parsed.invitations[0]).not.toHaveProperty('rawSecret')
  })

  it('defines the lightweight workspace member response without permission internals', () => {
    const parsed = listWorkspaceMembersResponseV1Schema.parse({
      members: [
        {
          userId: 'user-1',
          name: 'Ada',
          image: null,
          permissionType: 'admin',
        },
      ],
    })

    expect(parsed).toEqual({
      members: [{ userId: 'user-1', name: 'Ada', image: null }],
    })
  })

  it('keeps workspace host context free of subscription persistence fields', () => {
    const parsed = workspaceHostContextV1Schema.parse({
      workspace: {
        id: 'workspace-1',
        name: 'Platform',
        workspaceMode: 'organization',
        billedAccountUserId: 'owner-1',
        ownerId: 'lifecycle-owner-must-not-cross',
      },
      hostOrganizationId: 'organization-1',
      ownerBilling: {
        plan: 'enterprise',
        status: 'active',
        isPaid: true,
        isPro: false,
        isTeam: false,
        isEnterprise: true,
        isOrgScoped: true,
        organizationId: 'organization-1',
        billingInterval: 'year',
        billingBlocked: false,
        billingBlockedReason: null,
        stripeSubscriptionId: 'must-not-cross',
      },
      viewer: {
        permission: 'read',
        isHostOrganizationMember: false,
        isHostOrganizationAdmin: false,
      },
    })

    expect(parsed.workspace).not.toHaveProperty('ownerId')
    expect(parsed.ownerBilling).not.toHaveProperty('stripeSubscriptionId')
  })

  it('bounds workspace execution metrics queries and strips persistence-only fields', () => {
    expect(workspaceExecutionMetricsQueryV1Schema.parse({})).toEqual({
      segments: 72,
      allTime: 'false',
    })
    expect(
      workspaceExecutionMetricsQueryV1Schema.parse({
        segments: '200',
        allTime: 'true',
      })
    ).toMatchObject({ segments: 200, allTime: 'true' })
    expect(() => workspaceExecutionMetricsQueryV1Schema.parse({ segments: '201' })).toThrow()

    const parsed = workspaceExecutionMetricsResponseV1Schema.parse({
      workflows: [
        {
          workflowId: 'workflow-1',
          workflowName: 'Release',
          databaseWorkspaceId: 'must-not-cross',
          segments: [
            {
              timestamp: '2026-07-30T10:00:00.000Z',
              totalExecutions: 2,
              successfulExecutions: 1,
              avgDurationMs: 150,
              p50Ms: 100,
              p90Ms: 100,
              p99Ms: 100,
              rawDurations: [100, 200],
            },
          ],
        },
      ],
      startTime: '2026-07-30T10:00:00.000Z',
      endTime: '2026-07-30T12:00:00.000Z',
      segmentMs: 3_600_000,
      queryPlan: 'must-not-cross',
    })

    expect(parsed).not.toHaveProperty('queryPlan')
    expect(parsed.workflows[0]).not.toHaveProperty('databaseWorkspaceId')
    expect(parsed.workflows[0]?.segments[0]).not.toHaveProperty('rawDurations')
  })

  it('defines the organization workspace picker response without persistence fields', () => {
    const parsed = listOrganizationWorkspacesResponseV1Schema.parse({
      workspaces: [
        {
          id: 'workspace-1',
          name: 'Platform',
          organizationId: 'organization-1',
          archivedAt: null,
        },
      ],
    })

    expect(parsed).toEqual({
      workspaces: [{ id: 'workspace-1', name: 'Platform' }],
    })
  })

  it('keeps organization roster persistence and invitation token fields off the wire', () => {
    const parsed = getOrganizationRosterResponseV1Schema.parse({
      success: true,
      data: {
        members: [
          {
            memberId: 'membership-1',
            userId: 'user-1',
            role: 'member',
            createdAt: '2026-07-30T00:00:00.000Z',
            name: 'Ada',
            email: 'ada@example.com',
            image: null,
            workspaces: [],
            organizationId: 'organization-1',
          },
        ],
        pendingInvitations: [
          {
            id: 'invitation-1',
            email: 'grace@example.com',
            role: 'member',
            kind: 'organization',
            membershipIntent: 'internal',
            createdAt: '2026-07-30T00:00:00.000Z',
            expiresAt: '2026-08-06T00:00:00.000Z',
            inviteeName: null,
            inviteeImage: null,
            workspaces: [],
            token: 'must-not-cross-the-contract',
          },
        ],
        workspaces: [],
      },
    })

    expect(parsed.data.members[0]).not.toHaveProperty('organizationId')
    expect(parsed.data.pendingInvitations[0]).not.toHaveProperty('token')
  })

  it('normalizes permission group defaults and filters invalid auth modes', () => {
    const config = normalizePermissionGroupConfigV1({
      disableSkills: true,
      deniedTools: ['slack_canvas', 42],
      allowedFileShareAuthTypes: ['password', 'invalid'],
      persistenceOnly: 'strip',
    })
    const parsed = getUserPermissionGroupResponseV1Schema.parse({
      permissionGroupId: 'group-1',
      groupName: 'Restricted',
      config,
      entitled: true,
      organizationId: 'organization-1',
      isOrgAdmin: false,
      persistenceOnly: 'strip',
    })

    expect(parsed.config).toMatchObject({
      disableSkills: true,
      disableCustomTools: false,
      deniedTools: ['slack_canvas'],
      allowedFileShareAuthTypes: ['password'],
    })
    expect(parsed).not.toHaveProperty('persistenceOnly')
  })

  it('keeps raw provider profiles outside the personal profile response', () => {
    const parsed = personalProfileResponseV1Schema.parse({
      account: {
        id: 'user-1',
        name: 'Ada',
        email: 'ada@example.com',
        emailVerified: true,
        image: null,
        role: 'user',
        createdAt: '2026-07-30T00:00:00.000Z',
      },
      workspace: {
        id: 'workspace-1',
        name: 'Platform',
        organizationId: 'organization-1',
      },
      identities: [
        {
          id: 'identity-1',
          providerKey: 'feishu',
          tenantKey: 'tenant-1',
          externalSubjectId: 'subject-1',
          providerUserId: 'provider-user-1',
          openId: 'open-1',
          unionId: 'union-1',
          email: 'ada@example.com',
          loginName: 'ada',
          displayName: 'Ada',
          status: 'active',
          lastSyncedAt: '2026-07-30T00:00:00.000Z',
          rawProfile: { accessToken: 'must-not-cross-the-contract' },
        },
      ],
    })

    expect(parsed.identities[0]).not.toHaveProperty('rawProfile')
  })
})

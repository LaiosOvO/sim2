import { describe, expect, it } from 'vitest'

const disposableDatabaseEnabled =
  process.env.SIM_TEST_DATABASE_DISPOSABLE === '1' && Boolean(process.env.DATABASE_URL)

if (process.env.SIM_REQUIRE_POSTGRES_TEST === '1' && !disposableDatabaseEnabled) {
  throw new Error('PostgreSQL integration requires DATABASE_URL and SIM_TEST_DATABASE_DISPOSABLE=1')
}

describe.runIf(disposableDatabaseEnabled)('native W2 PostgreSQL adapters', () => {
  it('executes invitation, workspace authorization, and member reads against PostgreSQL', async () => {
    const [
      { db },
      { readFile },
      { sql },
      { createDrizzleInvitationReadRepository },
      { createDrizzleOrganizationAccessControlEntitlementReader },
      { createDrizzleOrganizationWorkspaceReadRepository },
      { createDrizzlePersonalIdentityProfileRepository },
      { createDrizzleWorkspaceMemberReadRepository },
      { createDrizzleAccessResolver },
    ] = await Promise.all([
      import('@sim/db'),
      import('node:fs/promises'),
      import('drizzle-orm'),
      import('@/infrastructure/postgres/repositories/drizzle-invitation-read-repository'),
      import(
        '@/infrastructure/postgres/repositories/drizzle-organization-access-control-entitlement-reader'
      ),
      import(
        '@/infrastructure/postgres/repositories/drizzle-organization-workspace-read-repository'
      ),
      import('@/infrastructure/postgres/repositories/drizzle-personal-identity-profile-repository'),
      import('@/infrastructure/postgres/repositories/drizzle-workspace-member-read-repository'),
      import('@/middleware/authorization/infrastructure/drizzle-access-resolver'),
    ])

    for (const statement of [
      `create type invitation_kind as enum ('organization', 'workspace')`,
      `create type invitation_membership_intent as enum ('internal', 'external')`,
      `create type invitation_status as enum ('pending', 'accepted', 'rejected', 'cancelled', 'expired')`,
      `create type permission_type as enum ('admin', 'write', 'read')`,
      `create table "user" (
        id text primary key,
        name text not null,
        email text not null,
        email_verified boolean not null default true,
        image text,
        role text default 'user',
        created_at timestamp not null default now()
      )`,
      `create table organization (
        id text primary key,
        name text not null
      )`,
      `create table workspace (
        id text primary key,
        name text not null,
        organization_id text references organization(id),
        archived_at timestamp
      )`,
      `create table permissions (
        id text primary key,
        user_id text not null references "user"(id),
        entity_type text not null,
        entity_id text not null,
        permission_type permission_type not null
      )`,
      `create table member (
        id text primary key,
        user_id text not null references "user"(id),
        organization_id text not null references organization(id),
        role text not null
      )`,
      `create table user_stats (
        id text primary key,
        user_id text not null references "user"(id),
        billing_blocked boolean not null default false
      )`,
      `create table subscription (
        id text primary key,
        plan text not null,
        reference_id text not null,
        status text
      )`,
      `create table invitation (
        id text primary key,
        kind invitation_kind not null,
        email text not null,
        inviter_id text not null references "user"(id),
        organization_id text references organization(id),
        membership_intent invitation_membership_intent not null,
        role text not null,
        status invitation_status not null,
        token text not null,
        expires_at timestamp not null,
        created_at timestamp not null,
        updated_at timestamp not null
      )`,
      `create table invitation_workspace_grant (
        id text primary key,
        invitation_id text not null references invitation(id),
        workspace_id text not null references workspace(id),
        permission permission_type not null
      )`,
      `insert into "user" (
         id, name, email, email_verified, image, role, created_at
       ) values
         ('inviter-1', 'Grace', 'grace@example.com', true, null, 'user',
          '2026-07-01T00:00:00Z'),
         ('viewer-1', 'Viewer', 'viewer@example.com', true, null, 'user',
          '2026-07-02T00:00:00Z'),
         ('member-1', 'Ada', 'ada@member.example.com', true,
          'https://cdn.test/ada.png', 'user', '2026-07-03T00:00:00Z'),
         ('org-admin-1', 'Olivia', 'olivia@example.com', true, null, 'admin',
          '2026-07-04T00:00:00Z'),
         ('org-owner-1', 'Oscar', 'oscar@example.com', true, null, 'admin',
          '2026-07-05T00:00:00Z')`,
      `insert into organization (id, name)
       values ('organization-1', 'Platform')`,
      `insert into workspace (id, name, organization_id, archived_at) values
         ('workspace-1', 'Runtime', 'organization-1', null),
         ('workspace-denied', 'Secret', 'organization-1', null),
         ('workspace-archived', 'Archive', 'organization-1', '2026-07-01T00:00:00Z')`,
      `insert into permissions (id, user_id, entity_type, entity_id, permission_type) values
         ('permission-viewer', 'viewer-1', 'workspace', 'workspace-1', 'read'),
         ('permission-member', 'member-1', 'workspace', 'workspace-1', 'write'),
         ('permission-archived', 'viewer-1', 'workspace', 'workspace-archived', 'admin')`,
      `insert into member (id, user_id, organization_id, role) values
         ('membership-admin', 'org-admin-1', 'organization-1', 'admin'),
         ('membership-owner', 'org-owner-1', 'organization-1', 'owner')`,
      `insert into user_stats (id, user_id, billing_blocked)
       values ('stats-owner', 'org-owner-1', false)`,
      `insert into subscription (id, plan, reference_id, status)
       values ('subscription-1', 'enterprise', 'organization-1', 'active')`,
      `insert into invitation (
         id, kind, email, inviter_id, organization_id, membership_intent,
         role, status, token, expires_at, created_at, updated_at
       ) values
         ('invitation-visible', 'workspace', 'Ada@Example.com', 'inviter-1',
          'organization-1', 'external', 'member', 'pending', 'secret-visible',
          '2099-08-01T00:00:00Z', '2026-07-30T00:00:00Z',
          '2026-07-31T00:00:00Z'),
         ('invitation-expired', 'workspace', 'ada@example.com', 'inviter-1',
          'organization-1', 'external', 'member', 'pending', 'secret-expired',
          '2000-01-01T00:00:00Z', '2026-07-29T00:00:00Z',
          '2026-07-30T00:00:00Z'),
         ('invitation-accepted', 'workspace', 'ada@example.com', 'inviter-1',
          'organization-1', 'external', 'member', 'accepted', 'secret-accepted',
          '2099-08-01T00:00:00Z', '2026-07-28T00:00:00Z',
          '2026-07-29T00:00:00Z'),
         ('invitation-other-user', 'workspace', 'other@example.com', 'inviter-1',
          'organization-1', 'external', 'member', 'pending', 'secret-other',
          '2099-08-01T00:00:00Z', '2026-07-27T00:00:00Z',
          '2026-07-28T00:00:00Z')`,
      `insert into invitation_workspace_grant (
         id, invitation_id, workspace_id, permission
       ) values
         ('grant-1', 'invitation-visible', 'workspace-1', 'write'),
         ('grant-2', 'invitation-accepted', 'workspace-denied', 'read'),
         ('grant-3', 'invitation-expired', 'workspace-archived', 'admin')`,
    ]) {
      await db.execute(sql.raw(statement))
    }

    const migration = await readFile(
      new URL(
        '../../../../packages/db/migrations/0275_polaris_external_identity_read_model.sql',
        import.meta.url
      ),
      'utf8'
    )
    for (const statement of migration.split('--> statement-breakpoint')) {
      if (statement.trim()) await db.execute(sql.raw(statement))
    }
    await db.execute(sql`
      insert into external_identity (
        id, organization_id, user_id, provider_key, tenant_key,
        external_subject_id, provider_user_id, open_id, union_id,
        email, login_name, display_name, status, raw_profile, last_synced_at
      ) values
        (
          'identity-directory', 'organization-1', 'viewer-1', 'directory', 'tenant-z',
          'directory-subject', null, null, null, 'viewer@example.com', 'viewer',
          'Viewer Directory', 'active', '{"secret":"must-not-leak"}',
          '2026-07-29T00:00:00Z'
        ),
        (
          'identity-feishu', 'organization-1', 'viewer-1', 'feishu', 'tenant-a',
          'feishu-subject', 'provider-user-1', 'open-1', 'union-1',
          'viewer@example.com', 'viewer', 'Viewer Feishu', 'active',
          '{"accessToken":"must-not-leak"}', '2026-07-30T00:00:00Z'
        )
    `)

    const invitations =
      await createDrizzleInvitationReadRepository().listPendingForEmail('  ADA@example.COM ')

    expect(invitations).toEqual([
      {
        id: 'invitation-visible',
        kind: 'workspace',
        email: 'Ada@Example.com',
        organizationId: 'organization-1',
        organizationName: 'Platform',
        membershipIntent: 'external',
        role: 'member',
        status: 'pending',
        expiresAt: new Date('2099-08-01T00:00:00.000Z'),
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
      },
    ])
    expect(JSON.stringify(invitations)).not.toContain('secret-')

    const invitationRepository = createDrizzleInvitationReadRepository()
    const viewerWorkspaceInvitations =
      await invitationRepository.listForAccessibleWorkspaces('viewer-1')
    expect(viewerWorkspaceInvitations).toEqual([
      {
        id: 'invitation-visible',
        kind: 'workspace',
        email: 'Ada@Example.com',
        token: 'secret-visible',
        status: 'pending',
        expiresAt: new Date('2099-08-01T00:00:00.000Z'),
        createdAt: new Date('2026-07-30T00:00:00.000Z'),
        updatedAt: new Date('2026-07-31T00:00:00.000Z'),
        organizationId: 'organization-1',
        membershipIntent: 'external',
        inviterId: 'inviter-1',
        workspaceId: 'workspace-1',
        permission: 'write',
      },
    ])
    await expect(invitationRepository.listForAccessibleWorkspaces('inviter-1')).resolves.toEqual([])

    const adminWorkspaceInvitations =
      await invitationRepository.listForAccessibleWorkspaces('org-admin-1')
    expect(
      [...adminWorkspaceInvitations].sort((left, right) => left.id.localeCompare(right.id))
    ).toEqual([
      {
        id: 'invitation-accepted',
        kind: 'workspace',
        email: 'ada@example.com',
        token: 'secret-accepted',
        status: 'accepted',
        expiresAt: new Date('2099-08-01T00:00:00.000Z'),
        createdAt: new Date('2026-07-28T00:00:00.000Z'),
        updatedAt: new Date('2026-07-29T00:00:00.000Z'),
        organizationId: 'organization-1',
        membershipIntent: 'external',
        inviterId: 'inviter-1',
        workspaceId: 'workspace-denied',
        permission: 'read',
      },
      {
        id: 'invitation-visible',
        kind: 'workspace',
        email: 'Ada@Example.com',
        token: 'secret-visible',
        status: 'pending',
        expiresAt: new Date('2099-08-01T00:00:00.000Z'),
        createdAt: new Date('2026-07-30T00:00:00.000Z'),
        updatedAt: new Date('2026-07-31T00:00:00.000Z'),
        organizationId: 'organization-1',
        membershipIntent: 'external',
        inviterId: 'inviter-1',
        workspaceId: 'workspace-1',
        permission: 'write',
      },
    ])
    expect(adminWorkspaceInvitations.map((row) => row.workspaceId)).not.toContain(
      'workspace-archived'
    )

    const access = createDrizzleAccessResolver()
    await expect(access.workspacePermission('viewer-1', 'workspace-1')).resolves.toBe('read')
    await expect(access.workspacePermission('org-admin-1', 'workspace-1')).resolves.toBe('admin')
    await expect(access.workspacePermission('viewer-1', 'workspace-denied')).resolves.toBeNull()
    await expect(access.workspacePermission('viewer-1', 'workspace-archived')).resolves.toBeNull()

    const organizationWorkspaces =
      await createDrizzleOrganizationWorkspaceReadRepository().listByOrganization('organization-1')
    expect(organizationWorkspaces).toEqual([
      { id: 'workspace-archived', name: 'Archive' },
      { id: 'workspace-1', name: 'Runtime' },
      { id: 'workspace-denied', name: 'Secret' },
    ])

    const cloudEntitlement = createDrizzleOrganizationAccessControlEntitlementReader({
      billingEnabled: true,
      accessControlEnabled: false,
      hosted: true,
    })
    await expect(cloudEntitlement.isEntitled('organization-1')).resolves.toBe(true)
    await db.execute(sql`update user_stats set billing_blocked = true where id = 'stats-owner'`)
    await expect(cloudEntitlement.isEntitled('organization-1')).resolves.toBe(false)
    await expect(
      createDrizzleOrganizationAccessControlEntitlementReader({
        billingEnabled: true,
        accessControlEnabled: true,
        hosted: false,
      }).isEntitled('organization-1')
    ).resolves.toBe(true)
    await expect(
      createDrizzleOrganizationAccessControlEntitlementReader({
        billingEnabled: false,
        accessControlEnabled: false,
        hosted: false,
      }).isEntitled('organization-without-subscription')
    ).resolves.toBe(true)

    const members =
      await createDrizzleWorkspaceMemberReadRepository().listActiveMembers('workspace-1')
    expect([...members].sort((left, right) => left.userId.localeCompare(right.userId))).toEqual([
      {
        userId: 'member-1',
        name: 'Ada',
        image: 'https://cdn.test/ada.png',
      },
      {
        userId: 'viewer-1',
        name: 'Viewer',
        image: null,
      },
    ])
    expect(members.map((member) => member.userId)).not.toContain('org-admin-1')

    const personalProfile = await createDrizzlePersonalIdentityProfileRepository().findForUser(
      'workspace-1',
      'viewer-1'
    )
    expect(personalProfile).toEqual({
      account: {
        id: 'viewer-1',
        name: 'Viewer',
        email: 'viewer@example.com',
        emailVerified: true,
        image: null,
        role: 'user',
        createdAt: new Date('2026-07-02T00:00:00.000Z'),
      },
      workspace: {
        id: 'workspace-1',
        name: 'Runtime',
        organizationId: 'organization-1',
      },
      identities: [
        {
          id: 'identity-directory',
          providerKey: 'directory',
          tenantKey: 'tenant-z',
          externalSubjectId: 'directory-subject',
          identifiers: {},
          email: 'viewer@example.com',
          loginName: 'viewer',
          displayName: 'Viewer Directory',
          status: 'active',
          lastSyncedAt: new Date('2026-07-29T00:00:00.000Z'),
        },
        {
          id: 'identity-feishu',
          providerKey: 'feishu',
          tenantKey: 'tenant-a',
          externalSubjectId: 'feishu-subject',
          identifiers: {
            providerUserId: 'provider-user-1',
            openId: 'open-1',
            unionId: 'union-1',
          },
          email: 'viewer@example.com',
          loginName: 'viewer',
          displayName: 'Viewer Feishu',
          status: 'active',
          lastSyncedAt: new Date('2026-07-30T00:00:00.000Z'),
        },
      ],
    })
    expect(JSON.stringify(personalProfile)).not.toContain('must-not-leak')
  })
})

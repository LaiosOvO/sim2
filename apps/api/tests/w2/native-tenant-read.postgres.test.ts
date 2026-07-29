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
      { createDrizzleDataDrainEntitlementReader },
      { createDrizzleDataDrainRunReadRepository },
      { createDrizzleInvitationReadRepository },
      { createDrizzleOrganizationAccessControlEntitlementReader },
      { createDrizzleOrganizationInvitationHousekeeping },
      { createDrizzleOrganizationRosterReadRepository },
      { createDrizzleOrganizationWorkspaceReadRepository },
      { createDrizzlePersonalIdentityProfileRepository },
      { createDrizzleUserPermissionGroupReadRepository },
      { createDrizzleWorkspaceHostContextReadRepository },
      { createDrizzleWorkspaceMemberReadRepository },
      { createDrizzleAccessResolver },
    ] = await Promise.all([
      import('@sim/db'),
      import('node:fs/promises'),
      import('drizzle-orm'),
      import('@/infrastructure/postgres/repositories/drizzle-data-drain-entitlement-reader'),
      import('@/infrastructure/postgres/repositories/drizzle-data-drain-run-read-repository'),
      import('@/infrastructure/postgres/repositories/drizzle-invitation-read-repository'),
      import(
        '@/infrastructure/postgres/repositories/drizzle-organization-access-control-entitlement-reader'
      ),
      import('@/infrastructure/postgres/repositories/drizzle-organization-invitation-housekeeping'),
      import('@/infrastructure/postgres/repositories/drizzle-organization-roster-read-repository'),
      import(
        '@/infrastructure/postgres/repositories/drizzle-organization-workspace-read-repository'
      ),
      import('@/infrastructure/postgres/repositories/drizzle-personal-identity-profile-repository'),
      import(
        '@/infrastructure/postgres/repositories/drizzle-user-permission-group-read-repository'
      ),
      import(
        '@/infrastructure/postgres/repositories/drizzle-workspace-host-context-read-repository'
      ),
      import('@/infrastructure/postgres/repositories/drizzle-workspace-member-read-repository'),
      import('@/middleware/authorization/infrastructure/drizzle-access-resolver'),
    ])

    for (const statement of [
      `create type invitation_kind as enum ('organization', 'workspace')`,
      `create type invitation_membership_intent as enum ('internal', 'external')`,
      `create type invitation_status as enum ('pending', 'accepted', 'rejected', 'cancelled', 'expired')`,
      `create type permission_type as enum ('admin', 'write', 'read')`,
      `create type data_drain_run_status as enum ('running', 'success', 'failed')`,
      `create type data_drain_run_trigger as enum ('cron', 'manual')`,
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
        owner_id text not null references "user"(id),
        organization_id text references organization(id),
        workspace_mode text not null,
        billed_account_user_id text not null references "user"(id),
        archived_at timestamp
      )`,
      `create table permission_group (
        id text primary key,
        organization_id text not null references organization(id),
        name text not null,
        config jsonb not null default '{}',
        created_by text not null references "user"(id),
        created_at timestamp not null default now(),
        is_default boolean not null default false
      )`,
      `create table permission_group_workspace (
        id text primary key,
        permission_group_id text not null references permission_group(id),
        workspace_id text not null references workspace(id),
        organization_id text not null references organization(id)
      )`,
      `create table permission_group_member (
        id text primary key,
        permission_group_id text not null references permission_group(id),
        organization_id text not null references organization(id),
        user_id text not null references "user"(id)
      )`,
      `create table permissions (
        id text primary key,
        user_id text not null references "user"(id),
        entity_type text not null,
        entity_id text not null,
        permission_type permission_type not null,
        created_at timestamp not null default now()
      )`,
      `create table member (
        id text primary key,
        user_id text not null references "user"(id),
        organization_id text not null references organization(id),
        role text not null,
        created_at timestamp not null default now()
      )`,
      `create table user_stats (
        id text primary key,
        user_id text not null references "user"(id),
        billing_blocked boolean not null default false,
        billing_blocked_reason text
      )`,
      `create table subscription (
        id text primary key,
        plan text not null,
        reference_id text not null,
        status text,
        period_start timestamp,
        billing_interval text,
        metadata jsonb
      )`,
      `create table data_drains (
        id text primary key,
        organization_id text not null references organization(id)
      )`,
      `create table data_drain_runs (
        id text primary key,
        drain_id text not null references data_drains(id),
        status data_drain_run_status not null,
        trigger data_drain_run_trigger not null,
        started_at timestamp not null,
        finished_at timestamp,
        rows_exported integer not null default 0,
        bytes_written bigint not null default 0,
        cursor_before text,
        cursor_after text,
        error text,
        locators jsonb
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
       values
         ('organization-1', 'Platform'),
         ('organization-other', 'Other')`,
      `insert into workspace (
         id, name, owner_id, organization_id, workspace_mode, billed_account_user_id, archived_at
       ) values
         ('workspace-1', 'Runtime', 'org-owner-1', 'organization-1', 'organization',
          'org-owner-1', null),
         ('workspace-denied', 'Secret', 'org-owner-1', 'organization-1', 'organization',
          'org-owner-1', null),
         ('workspace-archived', 'Archive', 'org-owner-1', 'organization-1', 'organization',
          'org-owner-1', '2026-07-01T00:00:00Z'),
         ('workspace-other', 'Other Secret', 'inviter-1', 'organization-other', 'organization',
          'inviter-1', null),
         ('workspace-personal', 'Personal', 'member-1', null, 'personal', 'member-1', null)`,
      `insert into permissions (
         id, user_id, entity_type, entity_id, permission_type, created_at
       ) values
         ('permission-viewer', 'viewer-1', 'workspace', 'workspace-1', 'read',
          '2026-07-08T00:00:00Z'),
         ('permission-member', 'member-1', 'workspace', 'workspace-1', 'write',
          '2026-07-09T00:00:00Z'),
         ('permission-personal-viewer', 'viewer-1', 'workspace', 'workspace-personal', 'read',
          '2026-07-10T00:00:00Z'),
         ('permission-archived', 'viewer-1', 'workspace', 'workspace-archived', 'admin',
          '2026-07-07T00:00:00Z')`,
      `insert into member (id, user_id, organization_id, role, created_at) values
         ('membership-admin', 'org-admin-1', 'organization-1', 'admin',
          '2026-07-04T00:00:00Z'),
         ('membership-owner', 'org-owner-1', 'organization-1', 'owner',
          '2026-07-05T00:00:00Z')`,
      `insert into permission_group (
         id, organization_id, name, config, created_by, created_at, is_default
       ) values
         ('group-explicit-old', 'organization-1', 'Explicit Old',
          '{"disableSkills":true}', 'org-owner-1', '2026-07-01T00:00:00Z', false),
         ('group-explicit-new', 'organization-1', 'Explicit New',
          '{"disableMcpTools":true}', 'org-owner-1', '2026-07-02T00:00:00Z', false),
         ('group-all-members', 'organization-1', 'All Members',
          '{"hideFilesTab":true}', 'org-owner-1', '2026-07-03T00:00:00Z', false),
         ('group-default', 'organization-1', 'Default',
          '{"disableCustomTools":true}', 'org-owner-1', '2026-07-04T00:00:00Z', true)`,
      `insert into permission_group_workspace (
         id, permission_group_id, workspace_id, organization_id
       ) values
         ('group-workspace-explicit-old', 'group-explicit-old', 'workspace-1',
          'organization-1'),
         ('group-workspace-explicit-new', 'group-explicit-new', 'workspace-1',
          'organization-1'),
         ('group-workspace-all-members', 'group-all-members', 'workspace-1',
          'organization-1')`,
      `insert into permission_group_member (
         id, permission_group_id, organization_id, user_id
       ) values
         ('group-member-explicit-old', 'group-explicit-old', 'organization-1', 'viewer-1'),
         ('group-member-explicit-new', 'group-explicit-new', 'organization-1', 'viewer-1')`,
      `insert into user_stats (id, user_id, billing_blocked, billing_blocked_reason)
       values
         ('stats-owner', 'org-owner-1', false, null),
         ('stats-personal', 'member-1', true, 'dispute')`,
      `insert into subscription (
         id, plan, reference_id, status, period_start, billing_interval, metadata
       ) values
         ('subscription-org-old', 'enterprise', 'organization-1', 'active',
          '2026-06-01T00:00:00Z', 'month', null),
         ('subscription-1', 'enterprise', 'organization-1', 'past_due',
          '2026-07-01T00:00:00Z', 'year', null),
         ('subscription-personal-pro', 'pro_6000', 'member-1', 'active',
          '2026-07-01T00:00:00Z', null, '{"billingInterval":"year"}'),
         ('subscription-personal-team', 'team_6000', 'member-1', 'active',
          '2026-07-02T00:00:00Z', null, null),
         ('subscription-personal-enterprise', 'enterprise', 'member-1', 'active',
          '2026-07-03T00:00:00Z', 'month', null)`,
      `insert into data_drains (id, organization_id) values
         ('drain-1', 'organization-1'),
         ('drain-other', 'organization-other')`,
      `insert into data_drain_runs (
         id, drain_id, status, trigger, started_at, finished_at,
         rows_exported, bytes_written, cursor_before, cursor_after, error, locators
       ) values
         ('run-new', 'drain-1', 'success', 'manual', '2026-07-30T02:00:00Z',
          '2026-07-30T02:01:00Z', 12, 345, 'before', 'after', null,
          '["s3://bucket/new"]'),
         ('run-old', 'drain-1', 'failed', 'cron', '2026-07-29T02:00:00Z',
          '2026-07-29T02:01:00Z', 0, 0, null, null, 'delivery failed', '[]'),
         ('run-other', 'drain-other', 'running', 'cron', '2026-07-31T02:00:00Z',
          null, 0, 0, null, null, null, '[]')`,
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

    const hostContexts = createDrizzleWorkspaceHostContextReadRepository()
    await expect(hostContexts.readForViewer('workspace-1', 'viewer-1')).resolves.toEqual({
      workspace: {
        id: 'workspace-1',
        name: 'Runtime',
        workspaceMode: 'organization',
        billedAccountUserId: 'org-owner-1',
        organizationId: 'organization-1',
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
    })
    await expect(hostContexts.readForViewer('workspace-1', 'org-admin-1')).resolves.toMatchObject({
      viewerOrganizationRole: 'admin',
    })
    await expect(hostContexts.readForViewer('workspace-personal', 'viewer-1')).resolves.toEqual({
      workspace: {
        id: 'workspace-personal',
        name: 'Personal',
        workspaceMode: 'personal',
        billedAccountUserId: 'member-1',
        organizationId: null,
      },
      viewerOrganizationRole: null,
      subscription: {
        plan: 'enterprise',
        status: 'active',
        billingInterval: 'month',
        metadata: null,
      },
      billingBlocked: true,
      billingBlockedReason: 'dispute',
    })
    await expect(hostContexts.readForViewer('workspace-archived', 'viewer-1')).resolves.toBeNull()

    const organizationWorkspaces =
      await createDrizzleOrganizationWorkspaceReadRepository().listByOrganization('organization-1')
    expect(organizationWorkspaces).toEqual([
      { id: 'workspace-archived', name: 'Archive' },
      { id: 'workspace-1', name: 'Runtime' },
      { id: 'workspace-denied', name: 'Secret' },
    ])

    const dataDrainEntitlement = createDrizzleDataDrainEntitlementReader({
      billingEnabled: true,
      dataDrainsEnabled: false,
      accessControlEnabled: false,
      hosted: true,
    })
    await expect(dataDrainEntitlement.isEntitled('organization-1')).resolves.toBe(true)
    const dataDrainRuns = createDrizzleDataDrainRunReadRepository()
    await expect(
      dataDrainRuns.listForOrganization('organization-1', 'drain-1', 1)
    ).resolves.toEqual([
      {
        id: 'run-new',
        drainId: 'drain-1',
        status: 'success',
        trigger: 'manual',
        startedAt: new Date('2026-07-30T02:00:00.000Z'),
        finishedAt: new Date('2026-07-30T02:01:00.000Z'),
        rowsExported: 12,
        bytesWritten: 345,
        cursorBefore: 'before',
        cursorAfter: 'after',
        error: null,
        locators: ['s3://bucket/new'],
      },
    ])
    await expect(
      dataDrainRuns.listForOrganization('organization-other', 'drain-1', 25)
    ).resolves.toBeNull()

    const cloudEntitlement = createDrizzleOrganizationAccessControlEntitlementReader({
      billingEnabled: true,
      accessControlEnabled: false,
      hosted: true,
    })
    await expect(cloudEntitlement.isEntitled('organization-1')).resolves.toBe(true)
    await db.execute(sql`update user_stats set billing_blocked = true where id = 'stats-owner'`)
    await expect(cloudEntitlement.isEntitled('organization-1')).resolves.toBe(false)
    await expect(dataDrainEntitlement.isEntitled('organization-1')).resolves.toBe(false)
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

    await db.execute(sql`
      insert into invitation_workspace_grant (id, invitation_id, workspace_id, permission)
      values ('grant-cross-organization', 'invitation-visible', 'workspace-other', 'admin')
    `)
    const housekeeping = createDrizzleOrganizationInvitationHousekeeping()
    await housekeeping.expireStalePending('organization-1')
    const roster =
      await createDrizzleOrganizationRosterReadRepository().loadAdminSnapshot('organization-1')

    expect(roster.members).toEqual([
      {
        memberId: 'membership-admin',
        userId: 'org-admin-1',
        role: 'admin',
        createdAt: new Date('2026-07-04T00:00:00.000Z'),
        name: 'Olivia',
        email: 'olivia@example.com',
        image: null,
      },
      {
        memberId: 'membership-owner',
        userId: 'org-owner-1',
        role: 'owner',
        createdAt: new Date('2026-07-05T00:00:00.000Z'),
        name: 'Oscar',
        email: 'oscar@example.com',
        image: null,
      },
    ])
    expect(roster.workspaces).toEqual([
      { id: 'workspace-1', name: 'Runtime' },
      { id: 'workspace-denied', name: 'Secret' },
    ])
    expect(roster.permissions.map((permission) => permission.workspaceId)).not.toContain(
      'workspace-archived'
    )
    expect(roster.permissions.map((permission) => permission.userId).sort()).toEqual([
      'member-1',
      'viewer-1',
    ])
    expect(roster.pendingInvitations.map((record) => record.id).sort()).toEqual([
      'invitation-other-user',
      'invitation-visible',
    ])
    expect(roster.invitationGrants).toEqual([
      {
        invitationId: 'invitation-visible',
        workspaceId: 'workspace-1',
        permission: 'write',
      },
    ])
    const expiredInvitation = await db.execute(
      sql`select status from invitation where id = 'invitation-expired'`
    )
    expect(expiredInvitation[0]?.status).toBe('expired')

    const permissionGroups = createDrizzleUserPermissionGroupReadRepository()
    await expect(permissionGroups.findActiveWorkspace('workspace-1')).resolves.toEqual({
      organizationId: 'organization-1',
    })
    await expect(permissionGroups.findActiveWorkspace('workspace-archived')).resolves.toBeNull()
    await expect(
      permissionGroups.resolveForUser('viewer-1', 'organization-1', 'workspace-1')
    ).resolves.toEqual({
      permissionGroupId: 'group-explicit-old',
      groupName: 'Explicit Old',
      config: { disableSkills: true },
    })
    await expect(
      permissionGroups.resolveForUser('member-1', 'organization-1', 'workspace-1')
    ).resolves.toEqual({
      permissionGroupId: 'group-all-members',
      groupName: 'All Members',
      config: { hideFilesTab: true },
    })
    await expect(
      permissionGroups.resolveForUser('viewer-1', 'organization-1', 'workspace-denied')
    ).resolves.toEqual({
      permissionGroupId: 'group-default',
      groupName: 'Default',
      config: { disableCustomTools: true },
    })
    await expect(
      permissionGroups.resolveForUser('viewer-1', 'organization-other', 'workspace-other')
    ).resolves.toBeNull()
  })
})

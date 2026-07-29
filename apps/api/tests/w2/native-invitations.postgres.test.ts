import { describe, expect, it } from 'vitest'

const disposableDatabaseEnabled =
  process.env.SIM_TEST_DATABASE_DISPOSABLE === '1' && Boolean(process.env.DATABASE_URL)

if (process.env.SIM_REQUIRE_POSTGRES_TEST === '1' && !disposableDatabaseEnabled) {
  throw new Error('PostgreSQL integration requires DATABASE_URL and SIM_TEST_DATABASE_DISPOSABLE=1')
}

describe.runIf(disposableDatabaseEnabled)('native invitation PostgreSQL adapter', () => {
  it('filters pending invitee rows and hydrates grants without exposing tokens', async () => {
    const [{ db }, { sql }, { createDrizzleInvitationReadRepository }] = await Promise.all([
      import('@sim/db'),
      import('drizzle-orm'),
      import('@/infrastructure/postgres/repositories/drizzle-invitation-read-repository'),
    ])

    for (const statement of [
      `create type invitation_kind as enum ('organization', 'workspace')`,
      `create type invitation_membership_intent as enum ('internal', 'external')`,
      `create type invitation_status as enum ('pending', 'accepted', 'rejected', 'cancelled', 'expired')`,
      `create type permission_type as enum ('admin', 'write', 'read')`,
      `create table "user" (
        id text primary key,
        name text not null,
        email text not null
      )`,
      `create table organization (
        id text primary key,
        name text not null
      )`,
      `create table workspace (
        id text primary key,
        name text not null
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
        created_at timestamp not null
      )`,
      `create table invitation_workspace_grant (
        id text primary key,
        invitation_id text not null references invitation(id),
        workspace_id text not null references workspace(id),
        permission permission_type not null
      )`,
      `insert into "user" (id, name, email)
       values ('inviter-1', 'Grace', 'grace@example.com')`,
      `insert into organization (id, name)
       values ('organization-1', 'Platform')`,
      `insert into workspace (id, name)
       values ('workspace-1', 'Runtime')`,
      `insert into invitation (
         id, kind, email, inviter_id, organization_id, membership_intent,
         role, status, token, expires_at, created_at
       ) values
         ('invitation-visible', 'workspace', 'Ada@Example.com', 'inviter-1',
          'organization-1', 'external', 'member', 'pending', 'secret-visible',
          '2099-08-01T00:00:00Z', '2026-07-30T00:00:00Z'),
         ('invitation-expired', 'workspace', 'ada@example.com', 'inviter-1',
          'organization-1', 'external', 'member', 'pending', 'secret-expired',
          '2000-01-01T00:00:00Z', '2026-07-29T00:00:00Z'),
         ('invitation-accepted', 'workspace', 'ada@example.com', 'inviter-1',
          'organization-1', 'external', 'member', 'accepted', 'secret-accepted',
          '2099-08-01T00:00:00Z', '2026-07-28T00:00:00Z'),
         ('invitation-other-user', 'workspace', 'other@example.com', 'inviter-1',
          'organization-1', 'external', 'member', 'pending', 'secret-other',
          '2099-08-01T00:00:00Z', '2026-07-27T00:00:00Z')`,
      `insert into invitation_workspace_grant (
         id, invitation_id, workspace_id, permission
       ) values (
         'grant-1', 'invitation-visible', 'workspace-1', 'write'
       )`,
    ]) {
      await db.execute(sql.raw(statement))
    }

    const result =
      await createDrizzleInvitationReadRepository().listPendingForEmail('  ADA@example.COM ')

    expect(result).toEqual([
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
    expect(JSON.stringify(result)).not.toContain('secret-')
  })
})

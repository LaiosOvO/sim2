import { describe, expect, it } from 'vitest'

const disposableDatabaseEnabled =
  process.env.SIM_TEST_DATABASE_DISPOSABLE === '1' && Boolean(process.env.DATABASE_URL)

if (process.env.SIM_REQUIRE_POSTGRES_TEST === '1' && !disposableDatabaseEnabled) {
  throw new Error('PostgreSQL integration requires DATABASE_URL and SIM_TEST_DATABASE_DISPOSABLE=1')
}

describe.runIf(disposableDatabaseEnabled)('native W6 execution-read PostgreSQL adapter', () => {
  it('projects paused details and tenant-scoped lists from real PostgreSQL rows', async () => {
    const [{ db }, { sql }, { createDrizzlePausedExecutionReader }] = await Promise.all([
      import('@sim/db'),
      import('drizzle-orm'),
      import('@/infrastructure/postgres/repositories/drizzle-paused-execution-reader'),
    ])

    for (const statement of [
      `create table paused_executions (
        id text primary key,
        workflow_id text not null,
        execution_id text not null unique,
        execution_snapshot jsonb not null,
        pause_points jsonb not null,
        total_pause_count integer not null,
        resumed_count integer not null default 0,
        automatic_resume_retry_count integer not null default 0,
        status text not null default 'paused',
        metadata jsonb not null default '{}',
        paused_at timestamp not null default now(),
        updated_at timestamp not null default now(),
        expires_at timestamp,
        next_resume_at timestamp
      )`,
      `create table resume_queue (
        id text primary key,
        paused_execution_id text not null references paused_executions(id) on delete cascade,
        parent_execution_id text not null,
        new_execution_id text not null,
        context_id text not null,
        resume_input jsonb,
        status text not null default 'pending',
        queued_at timestamp not null default now(),
        claimed_at timestamp,
        completed_at timestamp,
        failure_reason text
      )`,
      `insert into paused_executions (
        id, workflow_id, execution_id, execution_snapshot, pause_points, total_pause_count,
        resumed_count, status, metadata, paused_at, updated_at
      ) values
        (
          'paused-human', 'workflow-1', 'execution-1',
          '{"snapshot":"authorized-detail-state","triggerIds":["trigger-1"]}',
          '{
            "approval": {
              "contextId":"context-1",
              "blockId":"approval_loop3",
              "pauseKind":"human",
              "resumeStatus":"paused",
              "resumeLinks":{
                "apiUrl":"/api/resume/workflow-1/execution-1/context-1",
                "uiUrl":"https://example.test/resume?token=secret",
                "contextId":"context-1",
                "executionId":"execution-1",
                "workflowId":"workflow-1"
              }
            },
            "timer": {
              "contextId":"timer-1",
              "pauseKind":"time",
              "resumeStatus":"paused"
            }
          }',
          2, 0, 'partially_resumed', '{"source":"manual"}',
          '2026-07-30T00:00:00Z', '2026-07-30T00:01:00Z'
        ),
        (
          'paused-time', 'workflow-1', 'execution-time',
          '{"triggerIds":["trigger-time"],"serverOnly":"must-not-enter-list"}',
          '{"timer":{"contextId":"timer-only","pauseKind":"time","resumeStatus":"paused"}}',
          1, 0, 'paused', '{}',
          '2026-07-30T00:02:00Z', '2026-07-30T00:02:00Z'
        ),
        (
          'paused-other-tenant', 'workflow-2', 'execution-other',
          '{"triggerIds":["trigger-other"],"serverOnly":"must-not-cross-tenant"}',
          '{"human":{"contextId":"other-context","pauseKind":"human"}}',
          1, 0, 'partially_resumed', '{}',
          '2026-07-30T00:03:00Z', '2026-07-30T00:03:00Z'
        )`,
      `insert into resume_queue (
        id, paused_execution_id, parent_execution_id, new_execution_id, context_id,
        resume_input, status, queued_at, claimed_at, completed_at, failure_reason
      ) values
        (
          'queue-latest', 'paused-human', 'execution-1', 'execution-3', 'context-1',
          '{"approved":false}', 'failed', '2026-07-30T00:04:00Z', null,
          '2026-07-30T00:05:00Z', 'rejected'
        ),
        (
          'queue-first', 'paused-human', 'execution-1', 'execution-2', 'context-1',
          '{"approved":true}', 'pending', '2026-07-30T00:03:00Z', null, null, null
        ),
        (
          'queue-cross-workflow', 'paused-other-tenant', 'execution-1', 'execution-leak',
          'other-context', '{"secret":"must-not-cross-workflow"}', 'pending',
          '2026-07-30T00:02:00Z', null, null, null
        )`,
    ]) {
      await db.execute(sql.raw(statement))
    }

    const reader = createDrizzlePausedExecutionReader()
    const detail = await reader.readDetail('workflow-1', 'execution-1')
    expect(detail).toMatchObject({
      workflowId: 'workflow-1',
      executionId: 'execution-1',
      totalPauseCount: 1,
      resumedCount: 0,
      triggerIds: ['trigger-1'],
      pausePoints: [
        {
          contextId: 'context-1',
          blockId: 'approval',
          queuePosition: 1,
          latestResumeEntry: { id: 'queue-latest' },
          resumeLinks: { uiUrl: 'https://example.test/resume' },
        },
      ],
    })
    expect(detail?.queue.map((entry) => entry.id)).toEqual(['queue-first', 'queue-latest'])
    expect(JSON.stringify(detail)).not.toContain('queue-cross-workflow')
    expect(JSON.stringify(detail)).not.toContain('must-not-cross-workflow')

    const rows = await reader.list('workflow-1', { statuses: ['partially_resumed'] })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      workflowId: 'workflow-1',
      executionId: 'execution-1',
      triggerIds: ['trigger-1'],
    })
    expect(JSON.stringify(rows)).not.toContain('serverOnly')
    expect(JSON.stringify(rows)).not.toContain('trigger-other')
    await expect(reader.readDetail('workflow-1', 'execution-time')).resolves.toBeNull()
    await expect(reader.readDetail('workflow-1', 'execution-other')).resolves.toBeNull()
  })

  it('hides archived workspace and personal workflows before credential-scope authorization', async () => {
    const [
      { db },
      { sql },
      { createDrizzleWorkflowReadScopeReader },
      { createPlatformWorkflowReadAuthorizer },
    ] = await Promise.all([
      import('@sim/db'),
      import('drizzle-orm'),
      import('@/infrastructure/postgres/repositories/drizzle-workflow-read-scope-reader'),
      import('@/infrastructure/postgres/repositories/platform-workflow-read-authorizer'),
    ])

    for (const statement of [
      `create table if not exists workflow (
        id text primary key,
        user_id text not null,
        workspace_id text,
        folder_id text,
        name text not null,
        is_deployed boolean not null default false,
        fork_sync_excluded boolean not null default false,
        archived_at timestamp
      )`,
      `insert into workflow (
        id, user_id, workspace_id, name, archived_at
      ) values
        ('w6-active-workflow', 'user-w6', 'workspace-w6', 'Active', null),
        (
          'w6-archived-workspace', 'user-w6', 'workspace-other', 'Archived workspace',
          '2026-07-30T00:00:00Z'
        ),
        (
          'w6-archived-personal', 'user-w6', null, 'Archived personal',
          '2026-07-30T00:00:00Z'
        )`,
    ]) {
      await db.execute(sql.raw(statement))
    }

    const scopes = createDrizzleWorkflowReadScopeReader()
    await expect(scopes.readScope('w6-active-workflow')).resolves.toEqual({
      workspaceId: 'workspace-w6',
    })
    await expect(scopes.readScope('w6-archived-workspace')).resolves.toBeNull()
    await expect(scopes.readScope('w6-archived-personal')).resolves.toBeNull()

    const authorizer = createPlatformWorkflowReadAuthorizer({ scopes })
    const workspaceKeyContext = {
      authContextVersion: 1 as const,
      authenticationMethod: 'api-key' as const,
      actor: { id: 'user-w6', type: 'user' as const },
      requestId: 'request-w6-archived-workspace',
      credentialId: 'key-w6',
      keyType: 'workspace' as const,
      workspaceId: 'workspace-w6',
      permissions: [],
    }
    const sessionContext = {
      authContextVersion: 1 as const,
      authenticationMethod: 'session' as const,
      actor: { id: 'user-w6', type: 'user' as const },
      requestId: 'request-w6-archived-personal',
      activeOrganizationId: null,
      permissions: [],
    }

    await expect(
      authorizer.authorize(workspaceKeyContext, 'w6-archived-workspace')
    ).resolves.toEqual({
      allowed: false,
      status: 404,
      message: 'Workflow not found',
    })
    await expect(authorizer.authorize(sessionContext, 'w6-archived-personal')).resolves.toEqual({
      allowed: false,
      status: 404,
      message: 'Workflow not found',
    })
  })
})

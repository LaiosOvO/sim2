import { listWorkspaceBackgroundWorkResponseV1Schema } from '@sim/api-contracts/workspace-background-work'
import { describe, expect, it } from 'vitest'

const disposableDatabaseEnabled =
  process.env.SIM_TEST_DATABASE_DISPOSABLE === '1' && Boolean(process.env.DATABASE_URL)

if (process.env.SIM_REQUIRE_POSTGRES_TEST === '1' && !disposableDatabaseEnabled) {
  throw new Error('PostgreSQL integration requires DATABASE_URL and SIM_TEST_DATABASE_DISPOSABLE=1')
}

describe.runIf(disposableDatabaseEnabled)(
  'native workspace background-work PostgreSQL adapter',
  () => {
    it('preserves tenant scope, cursor precision, metadata boundary, and fixed query count', async () => {
      const [{ db }, { sql }, { createDrizzleWorkspaceBackgroundWorkReader }] = await Promise.all([
        import('@sim/db'),
        import('drizzle-orm'),
        import('@/infrastructure/postgres/repositories/drizzle-workspace-background-work-reader'),
      ])

      for (const statement of [
        'drop table if exists background_work_status cascade',
        'drop table if exists workspace cascade',
        'drop type if exists background_work_kind cascade',
        'drop type if exists background_work_status_value cascade',
        `create type background_work_kind as enum (
          'deployment_side_effects', 'fork_content_copy', 'fork_sync', 'fork_rollback'
        )`,
        `create type background_work_status_value as enum (
          'pending', 'processing', 'completed', 'completed_with_warnings', 'failed'
        )`,
        `create table workspace (
          id text primary key,
          forked_from_workspace_id text,
          archived_at timestamp
        )`,
        `create table background_work_status (
          id text primary key,
          workspace_id text not null,
          workflow_id text,
          kind background_work_kind not null,
          status background_work_status_value not null,
          message text,
          error text,
          metadata jsonb,
          started_at timestamp not null,
          completed_at timestamp,
          updated_at timestamp not null
        )`,
        `insert into workspace (id, forked_from_workspace_id, archived_at) values
          ('workspace-parent', null, null),
          ('workspace-child-live', 'workspace-parent', null),
          ('workspace-child-archived', 'workspace-parent', '2026-07-01T00:00:00Z'),
          ('workspace-other', null, null)`,
        `insert into background_work_status (
          id, workspace_id, workflow_id, kind, status, message, error, metadata,
          started_at, completed_at, updated_at
        ) values
          (
            'job-direct', 'workspace-parent', null, 'fork_content_copy', 'completed',
            'Direct', null, '{"actorName":"Ada","secretToken":"must-not-leak"}',
            '2026-07-30 10:00:00.123456', '2026-07-30 10:00:01',
            '2026-07-30 10:00:00.123456'
          ),
          (
            'job-same-z', 'workspace-parent', null, 'fork_sync', 'completed',
            'Same timestamp z', null, '{}',
            '2026-07-30 10:00:00.123456', '2026-07-30 10:00:01',
            '2026-07-30 10:00:00.123456'
          ),
          (
            'job-same-y', 'workspace-parent', null, 'fork_sync', 'completed',
            'Same timestamp y', null, '{}',
            '2026-07-30 10:00:00.123456', '2026-07-30 10:00:01',
            '2026-07-30 10:00:00.123456'
          ),
          (
            'job-micro-older', 'workspace-parent', null, 'fork_sync', 'completed',
            'One microsecond older', null, '{}',
            '2026-07-30 10:00:00.123455', '2026-07-30 10:00:01',
            '2026-07-30 10:00:00.123455'
          ),
          (
            'job-child-metadata', 'workspace-other', null, 'fork_content_copy', 'completed',
            'Created child', null, '{"childWorkspaceId":"workspace-parent"}',
            '2026-07-30 09:00:00', '2026-07-30 09:00:01', '2026-07-30 09:00:00'
          ),
          (
            'job-other-metadata', 'workspace-other', null, 'fork_sync', 'completed',
            'Other side', null, '{"otherWorkspaceId":"workspace-parent"}',
            '2026-07-30 08:00:00', '2026-07-30 08:00:01', '2026-07-30 08:00:00'
          ),
          (
            'job-live-child-sync', 'workspace-child-live', null, 'fork_sync', 'completed',
            'Legacy child sync', null, '{}',
            '2026-07-30 07:00:00', '2026-07-30 07:00:01', '2026-07-30 07:00:00'
          ),
          (
            'job-live-child-unrelated-kind', 'workspace-child-live', null,
            'deployment_side_effects', 'completed', 'Not an edge event', null, '{}',
            '2026-07-30 06:00:00', '2026-07-30 06:00:01', '2026-07-30 06:00:00'
          ),
          (
            'job-archived-child-sync', 'workspace-child-archived', null, 'fork_sync', 'completed',
            'Archived child', null, '{}',
            '2026-07-30 05:00:00', '2026-07-30 05:00:01', '2026-07-30 05:00:00'
          ),
          (
            'job-other-tenant', 'workspace-other', null, 'fork_rollback', 'failed',
            'must-not-cross-tenant', 'must-not-cross-tenant', '{}',
            '2026-07-30 04:00:00', '2026-07-30 04:00:01', '2026-07-30 04:00:00'
          )`,
      ]) {
        await db.execute(sql.raw(statement))
      }

      const reader = createDrizzleWorkspaceBackgroundWorkReader()
      const sameTimestampFirst = await reader.listInvolving({
        limit: 1,
        workspaceId: 'workspace-parent',
      })
      expect(sameTimestampFirst.records.map((record) => record.id)).toEqual(['job-same-z'])
      expect(
        JSON.parse(Buffer.from(sameTimestampFirst.nextCursor as string, 'base64').toString())
      ).toEqual({
        id: 'job-same-z',
        updatedAt: '2026-07-30 10:00:00.123456',
      })
      const sameTimestampSecond = await reader.listInvolving({
        cursor: sameTimestampFirst.nextCursor as string,
        limit: 1,
        workspaceId: 'workspace-parent',
      })
      expect(sameTimestampSecond.records.map((record) => record.id)).toEqual(['job-same-y'])

      const microsecondFirst = await reader.listInvolving({
        limit: 3,
        workspaceId: 'workspace-parent',
      })
      expect(microsecondFirst.records.map((record) => record.id)).toEqual([
        'job-same-z',
        'job-same-y',
        'job-direct',
      ])
      expect(
        JSON.parse(Buffer.from(microsecondFirst.nextCursor as string, 'base64').toString())
      ).toEqual({
        id: 'job-direct',
        updatedAt: '2026-07-30 10:00:00.123456',
      })
      const microsecondSecond = await reader.listInvolving({
        cursor: microsecondFirst.nextCursor as string,
        limit: 1,
        workspaceId: 'workspace-parent',
      })
      expect(microsecondSecond.records.map((record) => record.id)).toEqual(['job-micro-older'])
      expect(microsecondFirst.records[2]?.startedAt.getTime()).toBe(
        microsecondSecond.records[0]?.startedAt.getTime()
      )

      const allRows = await reader.listInvolving({
        limit: 100,
        workspaceId: 'workspace-parent',
      })
      expect(allRows.records.map((record) => record.id)).toEqual([
        'job-same-z',
        'job-same-y',
        'job-direct',
        'job-micro-older',
        'job-child-metadata',
        'job-other-metadata',
        'job-live-child-sync',
      ])
      expect(allRows.nextCursor).toBeNull()
      expect(JSON.stringify(allRows.records)).not.toContain('must-not-cross-tenant')
      expect(JSON.stringify(allRows.records)).not.toContain('job-live-child-unrelated-kind')
      expect(JSON.stringify(allRows.records)).not.toContain('job-archived-child-sync')

      const invalidCursor = await reader.listInvolving({
        cursor: Buffer.from(
          JSON.stringify({ id: 'job-x', updatedAt: '2026-02-30 09:00:00' })
        ).toString('base64'),
        limit: 2,
        workspaceId: 'workspace-parent',
      })
      expect(invalidCursor.records.map((record) => record.id)).toEqual(['job-same-z', 'job-same-y'])

      const parsed = listWorkspaceBackgroundWorkResponseV1Schema.parse({
        items: microsecondFirst.records.map((record) => ({
          ...record,
          completedAt: record.completedAt?.toISOString() ?? null,
          startedAt: record.startedAt.toISOString(),
        })),
        nextCursor: microsecondFirst.nextCursor,
      })
      expect(JSON.stringify(parsed)).not.toContain('must-not-leak')
      expect(parsed.items[2].metadata).toEqual({ actorName: 'Ada' })

      type QueryLogger = {
        logQuery(query: string, parameters: unknown[]): void
      }
      const session = (
        db as unknown as {
          _: { session: { logger: QueryLogger } }
        }
      )._.session
      async function observeReaderQueries(run: () => Promise<unknown>): Promise<readonly string[]> {
        const previous = session.logger
        const queries: string[] = []
        session.logger = {
          logQuery(query) {
            queries.push(query)
          },
        }
        try {
          await run()
          return queries
        } finally {
          session.logger = previous
        }
      }

      const smallSetQueries = await observeReaderQueries(() =>
        reader.listInvolving({ limit: 1, workspaceId: 'workspace-parent' })
      )
      expect(smallSetQueries).toHaveLength(2)
      expect(smallSetQueries.filter((query) => query.includes('from "workspace"'))).toHaveLength(1)
      expect(
        smallSetQueries.filter((query) => query.includes('from "background_work_status"'))
      ).toHaveLength(1)

      await db.execute(
        sql.raw(`insert into background_work_status (
          id, workspace_id, workflow_id, kind, status, message, error, metadata,
          started_at, completed_at, updated_at
        )
        select
          'bulk-' || lpad(value::text, 3, '0'),
          'workspace-parent',
          null,
          'fork_sync',
          'completed',
          'Bulk row',
          null,
          '{}',
          '2026-07-29 00:00:00',
          '2026-07-29 00:00:01',
          '2026-07-29 00:00:00'
        from generate_series(1, 250) as value`)
      )
      const largeSetQueries = await observeReaderQueries(() =>
        reader.listInvolving({ limit: 100, workspaceId: 'workspace-parent' })
      )
      expect(largeSetQueries).toHaveLength(2)
      expect(largeSetQueries.filter((query) => query.includes('from "workspace"'))).toHaveLength(1)
      expect(
        largeSetQueries.filter((query) => query.includes('from "background_work_status"'))
      ).toHaveLength(1)
    })
  }
)

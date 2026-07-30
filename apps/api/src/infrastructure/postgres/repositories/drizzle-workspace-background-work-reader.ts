import { db } from '@sim/db'
import { backgroundWorkStatus, workspace } from '@sim/db/schema'
import { and, desc, eq, inArray, isNull, lt, or, type SQL, sql } from 'drizzle-orm'
import type {
  WorkspaceBackgroundWorkPage,
  WorkspaceBackgroundWorkReader,
  WorkspaceBackgroundWorkRecord,
} from '@/modules/workspace-forking/ports/workspace-background-work-reader'

const surfacedStatuses = [
  'pending',
  'processing',
  'completed',
  'completed_with_warnings',
  'failed',
] as const
const cursorTimestampPattern =
  /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])[T ]([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,6})?Z?$/

type CursorData = {
  readonly id: string
  readonly updatedAt: string
}

function encodeCursor(data: CursorData): string {
  return Buffer.from(JSON.stringify(data)).toString('base64')
}

function decodeCursor(cursor: string): CursorData | null {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString()) as unknown
    if (!decoded || typeof decoded !== 'object') return null
    const value = decoded as Record<string, unknown>
    return typeof value.id === 'string' && typeof value.updatedAt === 'string'
      ? { id: value.id, updatedAt: value.updatedAt }
      : null
  } catch {
    return null
  }
}

function isValidCursorTimestamp(value: string): boolean {
  if (!cursorTimestampPattern.test(value)) return false
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function cursorCondition(cursor: string): SQL<unknown> | null {
  const value = decodeCursor(cursor)
  if (!value?.id || !isValidCursorTimestamp(value.updatedAt)) return null
  const timestamp = sql`${value.updatedAt}::timestamp`
  return (
    or(
      lt(backgroundWorkStatus.updatedAt, timestamp),
      and(eq(backgroundWorkStatus.updatedAt, timestamp), lt(backgroundWorkStatus.id, value.id))
    ) ?? null
  )
}

export function createDrizzleWorkspaceBackgroundWorkReader(): WorkspaceBackgroundWorkReader {
  return {
    async listInvolving(input): Promise<WorkspaceBackgroundWorkPage> {
      const limit = Math.min(Math.max(input.limit, 1), 100)
      const childRows = await db
        .select({ id: workspace.id })
        .from(workspace)
        .where(
          and(eq(workspace.forkedFromWorkspaceId, input.workspaceId), isNull(workspace.archivedAt))
        )
      const childWorkspaceIds = childRows.map((row) => row.id)
      const involvesWorkspace = or(
        eq(backgroundWorkStatus.workspaceId, input.workspaceId),
        sql`${backgroundWorkStatus.metadata} ->> 'childWorkspaceId' = ${input.workspaceId}`,
        sql`${backgroundWorkStatus.metadata} ->> 'otherWorkspaceId' = ${input.workspaceId}`,
        ...(childWorkspaceIds.length > 0
          ? [
              and(
                inArray(backgroundWorkStatus.workspaceId, childWorkspaceIds),
                inArray(backgroundWorkStatus.kind, ['fork_sync', 'fork_rollback'])
              ),
            ]
          : [])
      )
      const conditions: SQL<unknown>[] = [
        involvesWorkspace as SQL<unknown>,
        inArray(backgroundWorkStatus.status, surfacedStatuses),
      ]
      if (input.cursor) {
        const condition = cursorCondition(input.cursor)
        if (condition) conditions.push(condition)
      }

      const rows = await db
        .select({
          completedAt: backgroundWorkStatus.completedAt,
          error: backgroundWorkStatus.error,
          id: backgroundWorkStatus.id,
          kind: backgroundWorkStatus.kind,
          message: backgroundWorkStatus.message,
          metadata: backgroundWorkStatus.metadata,
          startedAt: backgroundWorkStatus.startedAt,
          status: backgroundWorkStatus.status,
          updatedAtCursor: sql<string>`${backgroundWorkStatus.updatedAt}::text`,
          workflowId: backgroundWorkStatus.workflowId,
          workspaceId: backgroundWorkStatus.workspaceId,
        })
        .from(backgroundWorkStatus)
        .where(and(...conditions))
        .orderBy(desc(backgroundWorkStatus.updatedAt), desc(backgroundWorkStatus.id))
        .limit(limit + 1)

      const hasMore = rows.length > limit
      const page = rows.slice(0, limit)
      const last = page.at(-1)
      return {
        records: page.map(
          ({ updatedAtCursor: _updatedAtCursor, ...record }) =>
            record satisfies WorkspaceBackgroundWorkRecord
        ),
        nextCursor:
          hasMore && last ? encodeCursor({ id: last.id, updatedAt: last.updatedAtCursor }) : null,
      }
    },
  }
}

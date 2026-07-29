import { dbReplica } from '@sim/db'
import { pausedExecutions, workflow, workflowExecutionLogs } from '@sim/db/schema'
import { and, eq, gte, inArray, isNotNull, isNull, lte, or, type SQL, sql } from 'drizzle-orm'
import type {
  WorkspaceExecutionMetricsLevel,
  WorkspaceExecutionMetricsLogFilter,
  WorkspaceExecutionMetricsReadRepository,
} from '@/modules/workspaces'

function levelCondition(levels: readonly WorkspaceExecutionMetricsLevel[]): SQL | undefined {
  const conditions: SQL[] = []
  for (const level of levels) {
    if (level === 'error') {
      conditions.push(eq(workflowExecutionLogs.level, 'error'))
    } else if (level === 'info') {
      const condition = and(
        eq(workflowExecutionLogs.level, 'info'),
        isNotNull(workflowExecutionLogs.endedAt)
      )
      if (condition) conditions.push(condition)
    } else if (level === 'running') {
      const condition = and(
        eq(workflowExecutionLogs.level, 'info'),
        isNull(workflowExecutionLogs.endedAt)
      )
      if (condition) conditions.push(condition)
    } else {
      const condition = and(
        eq(workflowExecutionLogs.level, 'info'),
        or(
          sql`(${pausedExecutions.totalPauseCount} > 0 AND ${pausedExecutions.resumedCount} < ${pausedExecutions.totalPauseCount})`,
          and(
            isNotNull(pausedExecutions.status),
            sql`${pausedExecutions.status} != 'fully_resumed'`
          )
        )
      )
      if (condition) conditions.push(condition)
    }
  }
  if (conditions.length === 0) return undefined
  return conditions.length === 1 ? conditions[0] : or(...conditions)
}

function logConditions(filter: WorkspaceExecutionMetricsLogFilter): SQL[] {
  const conditions: SQL[] = [inArray(workflowExecutionLogs.workflowId, [...filter.workflowIds])]
  if (filter.triggers !== undefined) {
    conditions.push(inArray(workflowExecutionLogs.trigger, [...filter.triggers]))
  }
  if (filter.levels !== undefined) {
    const condition = levelCondition(filter.levels)
    if (condition) conditions.push(condition)
  }
  return conditions
}

function date(value: Date | string | null): Date | null {
  if (!value) return null
  if (value instanceof Date) return value
  const isoLike = value.includes('T') ? value : value.replace(' ', 'T')
  const hasTimeZone = /(?:z|[+-]\d{2}(?::?\d{2})?)$/i.test(isoLike)
  return new Date(hasTimeZone ? isoLike : `${isoLike}Z`)
}

export function createDrizzleWorkspaceExecutionMetricsReadRepository(): WorkspaceExecutionMetricsReadRepository {
  return {
    listWorkflows(filter) {
      const conditions: SQL[] = [eq(workflow.workspaceId, filter.workspaceId)]
      if (filter.folderIds !== undefined) {
        conditions.push(inArray(workflow.folderId, [...filter.folderIds]))
      }
      if (filter.workflowIds !== undefined) {
        conditions.push(inArray(workflow.id, [...filter.workflowIds]))
      }
      return dbReplica
        .select({ id: workflow.id, name: workflow.name })
        .from(workflow)
        .where(and(...conditions))
    },

    async readBounds(filter) {
      const [bounds] = await dbReplica
        .select({
          minDate: sql<Date | string | null>`MIN(${workflowExecutionLogs.startedAt})`,
          maxDate: sql<Date | string | null>`MAX(${workflowExecutionLogs.startedAt})`,
        })
        .from(workflowExecutionLogs)
        .leftJoin(
          pausedExecutions,
          eq(pausedExecutions.executionId, workflowExecutionLogs.executionId)
        )
        .where(and(...logConditions(filter)))

      return {
        minDate: date(bounds?.minDate ?? null),
        maxDate: date(bounds?.maxDate ?? null),
      }
    },

    listSamples(filter) {
      return dbReplica
        .select({
          workflowId: workflowExecutionLogs.workflowId,
          level: workflowExecutionLogs.level,
          startedAt: workflowExecutionLogs.startedAt,
          totalDurationMs: workflowExecutionLogs.totalDurationMs,
        })
        .from(workflowExecutionLogs)
        .leftJoin(
          pausedExecutions,
          eq(pausedExecutions.executionId, workflowExecutionLogs.executionId)
        )
        .where(
          and(
            ...logConditions(filter),
            gte(workflowExecutionLogs.startedAt, filter.start),
            lte(workflowExecutionLogs.startedAt, filter.end)
          )
        )
    },
  }
}

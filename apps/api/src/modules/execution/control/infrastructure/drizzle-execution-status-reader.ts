import { db } from '@sim/db'
import { pausedExecutions, workflowExecutionLogs } from '@sim/db/schema'
import { and, eq } from 'drizzle-orm'
import type { ExecutionStatusReader } from '@/modules/execution/control'

interface DrizzleExecutionStatusReaderOptions {
  database?: Pick<typeof db, 'select'>
}

/**
 * Reads the status row and its optional pause overlay in one SQL statement.
 * Keeping this as one adapter method makes the polling query budget executable:
 * callers cannot accidentally turn the common status path back into N+1 reads.
 */
export function createDrizzleExecutionStatusReader(
  options: DrizzleExecutionStatusReaderOptions = {}
): ExecutionStatusReader {
  const database = options.database ?? db
  return {
    async read(workflowId, executionId) {
      const [row] = await database
        .select({
          execution: {
            executionId: workflowExecutionLogs.executionId,
            workflowId: workflowExecutionLogs.workflowId,
            workspaceId: workflowExecutionLogs.workspaceId,
            status: workflowExecutionLogs.status,
            level: workflowExecutionLogs.level,
            trigger: workflowExecutionLogs.trigger,
            startedAt: workflowExecutionLogs.startedAt,
            endedAt: workflowExecutionLogs.endedAt,
            totalDurationMs: workflowExecutionLogs.totalDurationMs,
            executionData: workflowExecutionLogs.executionData,
            costTotal: workflowExecutionLogs.costTotal,
          },
          paused: {
            id: pausedExecutions.id,
            status: pausedExecutions.status,
            pausePoints: pausedExecutions.pausePoints,
            metadata: pausedExecutions.metadata,
            resumedCount: pausedExecutions.resumedCount,
            pausedAt: pausedExecutions.pausedAt,
            nextResumeAt: pausedExecutions.nextResumeAt,
          },
        })
        .from(workflowExecutionLogs)
        .leftJoin(
          pausedExecutions,
          and(
            eq(pausedExecutions.workflowId, workflowId),
            eq(pausedExecutions.executionId, executionId)
          )
        )
        .where(
          and(
            eq(workflowExecutionLogs.workflowId, workflowId),
            eq(workflowExecutionLogs.executionId, executionId)
          )
        )
        .limit(1)
      if (!row) return null
      return {
        execution: {
          ...row.execution,
          executionData:
            row.execution.executionData && typeof row.execution.executionData === 'object'
              ? (row.execution.executionData as Record<string, unknown>)
              : {},
        },
        paused: row.paused,
      }
    },
  }
}

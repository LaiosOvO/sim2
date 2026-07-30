import { dbFor } from '@sim/db'
import { pausedExecutions, resumeQueue } from '@sim/db/schema'
import { and, asc, desc, eq, inArray, type SQL, sql } from 'drizzle-orm'
import type { PausedExecutionReader } from '@/modules/execution/read'
import {
  projectPausedExecutionDetail,
  projectPausedExecutionSummary,
} from '@/modules/execution/read'

const executionDb = dbFor('exec')

export function createDrizzlePausedExecutionReader(): PausedExecutionReader {
  return {
    async readDetail(workflowId, executionId) {
      const [row] = await executionDb
        .select({
          id: pausedExecutions.id,
          workflowId: pausedExecutions.workflowId,
          executionId: pausedExecutions.executionId,
          status: pausedExecutions.status,
          pausePoints: pausedExecutions.pausePoints,
          metadata: pausedExecutions.metadata,
          pausedAt: pausedExecutions.pausedAt,
          updatedAt: pausedExecutions.updatedAt,
          expiresAt: pausedExecutions.expiresAt,
          executionSnapshot: pausedExecutions.executionSnapshot,
        })
        .from(pausedExecutions)
        .where(
          and(
            eq(pausedExecutions.workflowId, workflowId),
            eq(pausedExecutions.executionId, executionId)
          )
        )
        .limit(1)

      if (!row) return null

      const queue = await executionDb
        .select({
          id: resumeQueue.id,
          pausedExecutionId: resumeQueue.pausedExecutionId,
          parentExecutionId: resumeQueue.parentExecutionId,
          newExecutionId: resumeQueue.newExecutionId,
          contextId: resumeQueue.contextId,
          resumeInput: resumeQueue.resumeInput,
          status: resumeQueue.status,
          queuedAt: resumeQueue.queuedAt,
          claimedAt: resumeQueue.claimedAt,
          completedAt: resumeQueue.completedAt,
          failureReason: resumeQueue.failureReason,
        })
        .from(resumeQueue)
        .where(
          and(
            eq(resumeQueue.parentExecutionId, executionId),
            eq(resumeQueue.pausedExecutionId, row.id)
          )
        )
        .orderBy(asc(resumeQueue.queuedAt))

      return projectPausedExecutionDetail(row, queue)
    },

    async list(workflowId, filter) {
      let predicate: SQL<unknown> = eq(pausedExecutions.workflowId, workflowId)
      const statuses = filter.statuses
      if (statuses?.length === 1) {
        predicate = and(predicate, eq(pausedExecutions.status, statuses[0] ?? '')) ?? predicate
      } else if (statuses && statuses.length > 1) {
        predicate = and(predicate, inArray(pausedExecutions.status, [...statuses])) ?? predicate
      }

      const rows = await executionDb
        .select({
          id: pausedExecutions.id,
          workflowId: pausedExecutions.workflowId,
          executionId: pausedExecutions.executionId,
          status: pausedExecutions.status,
          pausePoints: pausedExecutions.pausePoints,
          metadata: pausedExecutions.metadata,
          pausedAt: pausedExecutions.pausedAt,
          updatedAt: pausedExecutions.updatedAt,
          expiresAt: pausedExecutions.expiresAt,
          triggerIds: sql<unknown>`${pausedExecutions.executionSnapshot}->'triggerIds'`,
        })
        .from(pausedExecutions)
        .where(predicate)
        .orderBy(desc(pausedExecutions.pausedAt))

      return rows.flatMap((row) => {
        const summary = projectPausedExecutionSummary(row)
        return summary ? [summary] : []
      })
    },
  }
}

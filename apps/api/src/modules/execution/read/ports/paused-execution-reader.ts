import type { PausedExecutionDetailV1, PausedExecutionSummaryV1 } from '@sim/api-contracts'

export interface PausedExecutionListFilter {
  statuses?: readonly string[]
}

/**
 * Durable paused-execution read model. Implementations own persistence
 * projection, queue enrichment and removal of time-only pause contexts.
 */
export interface PausedExecutionReader {
  readDetail(workflowId: string, executionId: string): Promise<PausedExecutionDetailV1 | null>
  list(
    workflowId: string,
    filter: PausedExecutionListFilter
  ): Promise<readonly PausedExecutionSummaryV1[]>
}

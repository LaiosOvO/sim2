import type { ExecutionEventV1 } from '@sim/execution-contracts/events'

export type ExecutionTerminalStatus = 'completed' | 'failed' | 'cancelled' | 'dead-lettered'

export interface ExecutionJobStateStore {
  claim(jobId: string, executionId: string, attempt: number): Promise<'claimed' | 'duplicate'>
  releaseForRetry(jobId: string, attempt: number): Promise<void>
  markTerminal(jobId: string, status: ExecutionTerminalStatus): Promise<void>
  nextSequence(executionId: string): Promise<number>
  requestCancellation(
    executionId: string,
    reason?: string
  ): Promise<{ duplicate: boolean; reason?: string }>
  cancellation(executionId: string): Promise<{ requested: boolean; reason?: string }>
}

export interface ExecutionEventSink {
  append(event: ExecutionEventV1): Promise<void> | void
}

export interface ExecutionEventReader {
  list(executionId: string): Promise<readonly ExecutionEventV1[]> | readonly ExecutionEventV1[]
}

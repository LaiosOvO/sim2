import type { ExecutionEventV1 } from '@sim/execution-contracts/events'
import type {
  ExecutionEventReader,
  ExecutionEventSink,
  ExecutionJobStateStore,
  ExecutionTerminalStatus,
} from './types'

interface JobRecord {
  executionId: string
  lastAttempt: number
  status: 'active' | 'retry' | ExecutionTerminalStatus
}

export interface InMemoryExecutionState
  extends ExecutionJobStateStore,
    ExecutionEventSink,
    ExecutionEventReader {
  events(executionId?: string): readonly ExecutionEventV1[]
  jobStatus(jobId: string): JobRecord['status'] | undefined
}

export function createInMemoryExecutionState(): InMemoryExecutionState {
  const jobs = new Map<string, JobRecord>()
  const cancellations = new Map<string, string | undefined>()
  const sequences = new Map<string, number>()
  const recordedEvents: ExecutionEventV1[] = []

  return {
    async claim(jobId, executionId, attempt) {
      const current = jobs.get(jobId)
      if (!current) {
        jobs.set(jobId, { executionId, lastAttempt: attempt, status: 'active' })
        return 'claimed'
      }
      if (current.status === 'retry' && attempt > current.lastAttempt) {
        jobs.set(jobId, { executionId, lastAttempt: attempt, status: 'active' })
        return 'claimed'
      }
      return 'duplicate'
    },
    async releaseForRetry(jobId, attempt) {
      const current = jobs.get(jobId)
      if (!current || current.lastAttempt !== attempt || current.status !== 'active') return
      current.status = 'retry'
    },
    async markTerminal(jobId, status) {
      const current = jobs.get(jobId)
      if (current) current.status = status
    },
    async nextSequence(executionId) {
      const sequence = sequences.get(executionId) ?? 0
      sequences.set(executionId, sequence + 1)
      return sequence
    },
    async requestCancellation(executionId, reason) {
      const duplicate = cancellations.has(executionId)
      if (!duplicate) cancellations.set(executionId, reason)
      return {
        duplicate,
        reason: cancellations.get(executionId),
      }
    },
    async cancellation(executionId) {
      return {
        requested: cancellations.has(executionId),
        reason: cancellations.get(executionId),
      }
    },
    async append(event) {
      recordedEvents.push(event)
    },
    list(executionId) {
      return recordedEvents.filter((event) => event.executionId === executionId)
    },
    events(executionId) {
      return executionId
        ? recordedEvents.filter((event) => event.executionId === executionId)
        : [...recordedEvents]
    },
    jobStatus(jobId) {
      return jobs.get(jobId)?.status
    },
  }
}

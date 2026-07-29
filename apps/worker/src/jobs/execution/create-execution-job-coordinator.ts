import { randomUUID } from 'node:crypto'
import {
  EXECUTION_CONTRACTS_VERSION,
  type ExecutionEventV1,
  executionEventV1Schema,
} from '@sim/execution-contracts'
import {
  type ExecutionCancellationResponseV1,
  sandboxTestJobPayloadV1Schema,
} from '@sim/execution-contracts/job-control'
import { type ExecutionJobV1, executionJobV1Schema } from '@sim/execution-contracts/jobs'
import type { ExecutionJobCoordinator, ExecutionJobDelivery } from '@/jobs/queue/types'
import type { ExecutionEventSink, ExecutionJobStateStore } from '@/jobs/state/types'
import { type SandboxExecution, SandboxExecutionFailure } from '@/sandbox/interface/types'

type EventDetails =
  | { type: 'started'; attempt: number }
  | { type: 'retry-scheduled'; attempt: number; nextAttempt: number; reason: string }
  | { type: 'completed'; output: unknown }
  | { type: 'failed'; errorCode: string; message: string; retryable: boolean }
  | { type: 'cancelled'; reason?: string }
  | { type: 'dead-lettered'; reason: string }

export interface ExecutionJobCoordinatorOptions {
  state: ExecutionJobStateStore
  events: ExecutionEventSink
  sandbox: SandboxExecution
  maxAttempts?: number
  retryDelayMs?: (attempt: number) => number
  now?: () => Date
  eventId?: () => string
}

export function createExecutionJobCoordinator(
  options: ExecutionJobCoordinatorOptions
): ExecutionJobCoordinator {
  const maxAttempts = options.maxAttempts ?? 3
  const retryDelayMs =
    options.retryDelayMs ?? ((attempt) => Math.min(1000 * 2 ** (attempt - 1), 30_000))
  const now = options.now ?? (() => new Date())
  const eventId = options.eventId ?? randomUUID
  const active = new Map<string, AbortController>()

  async function emit(job: ExecutionJobV1, details: EventDetails): Promise<ExecutionEventV1> {
    const event = executionEventV1Schema.parse({
      contractVersion: EXECUTION_CONTRACTS_VERSION,
      eventId: eventId(),
      executionId: job.executionId,
      sequence: await options.state.nextSequence(job.executionId),
      occurredAt: now().toISOString(),
      ...details,
    })
    await options.events.append(event)
    return event
  }

  async function finishFailure(
    delivery: ExecutionJobDelivery,
    job: ExecutionJobV1,
    failure: SandboxExecutionFailure
  ): Promise<void> {
    if (failure.code === 'SANDBOX_CANCELLED') {
      const cancellation = await options.state.cancellation(job.executionId)
      await emit(job, {
        type: 'cancelled',
        reason: cancellation.reason ?? failure.message,
      })
      await options.state.markTerminal(job.jobId, 'cancelled')
      await delivery.ack()
      return
    }

    if (failure.retryable && delivery.attempt < maxAttempts) {
      await emit(job, {
        type: 'retry-scheduled',
        attempt: delivery.attempt,
        nextAttempt: delivery.attempt + 1,
        reason: failure.message,
      })
      await options.state.releaseForRetry(job.jobId, delivery.attempt)
      await delivery.retry(retryDelayMs(delivery.attempt))
      return
    }

    if (failure.retryable) {
      await emit(job, {
        type: 'dead-lettered',
        reason: `${failure.code}: ${failure.message}`,
      })
      await options.state.markTerminal(job.jobId, 'dead-lettered')
      await delivery.deadLetter(`${failure.code}:${failure.message}`)
      return
    }

    await emit(job, {
      type: 'failed',
      errorCode: failure.code,
      message: failure.message,
      retryable: false,
    })
    await options.state.markTerminal(job.jobId, 'failed')
    await delivery.ack()
  }

  return {
    async handle(delivery) {
      const parsedJob = executionJobV1Schema.safeParse(delivery.candidate)
      if (!parsedJob.success) {
        await delivery.deadLetter('EXECUTION_JOB_INVALID')
        return
      }
      const job = parsedJob.data
      const claim = await options.state.claim(job.jobId, job.executionId, delivery.attempt)
      if (claim === 'duplicate') {
        await delivery.ack()
        return
      }

      const parsedPayload = sandboxTestJobPayloadV1Schema.safeParse(job.payload)
      if (!parsedPayload.success) {
        await emit(job, {
          type: 'dead-lettered',
          reason: 'SANDBOX_JOB_PAYLOAD_INVALID',
        })
        await options.state.markTerminal(job.jobId, 'dead-lettered')
        await delivery.deadLetter('SANDBOX_JOB_PAYLOAD_INVALID')
        return
      }

      const pendingCancellation = await options.state.cancellation(job.executionId)
      if (pendingCancellation.requested) {
        await emit(job, {
          type: 'cancelled',
          reason: pendingCancellation.reason,
        })
        await options.state.markTerminal(job.jobId, 'cancelled')
        await delivery.ack()
        return
      }

      const controller = new AbortController()
      active.set(job.executionId, controller)
      const timeout = setTimeout(() => {
        controller.abort(
          new SandboxExecutionFailure(
            'SANDBOX_TIMEOUT',
            `Sandbox exceeded ${parsedPayload.data.policy.wallClockMs} ms`,
            false
          )
        )
      }, parsedPayload.data.policy.wallClockMs)
      timeout.unref?.()

      try {
        await emit(job, { type: 'started', attempt: delivery.attempt })
        const result = await options.sandbox.execute({
          executionId: job.executionId,
          attempt: delivery.attempt,
          payload: parsedPayload.data,
          signal: controller.signal,
        })
        await emit(job, { type: 'completed', output: result.output })
        await options.state.markTerminal(job.jobId, 'completed')
        await delivery.ack()
      } catch (error) {
        const failure =
          error instanceof SandboxExecutionFailure
            ? error
            : new SandboxExecutionFailure(
                'SANDBOX_TRANSIENT_FAILURE',
                error instanceof Error ? error.message : 'Unexpected Sandbox failure',
                true
              )
        await finishFailure(delivery, job, failure)
      } finally {
        clearTimeout(timeout)
        if (active.get(job.executionId) === controller) active.delete(job.executionId)
      }
    },
    async cancel(executionId, reason): Promise<ExecutionCancellationResponseV1> {
      const cancellation = await options.state.requestCancellation(executionId, reason)
      active
        .get(executionId)
        ?.abort(
          new SandboxExecutionFailure(
            'SANDBOX_CANCELLED',
            cancellation.reason ?? 'Sandbox execution cancelled',
            false
          )
        )
      return {
        contractVersion: EXECUTION_CONTRACTS_VERSION,
        executionId,
        requested: true,
        duplicate: cancellation.duplicate,
      }
    },
  }
}

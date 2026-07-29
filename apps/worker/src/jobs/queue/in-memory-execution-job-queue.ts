import { randomUUID } from 'node:crypto'
import { EXECUTION_CONTRACTS_VERSION } from '@sim/execution-contracts'
import type { ExecutionJobAdmissionResponseV1 } from '@sim/execution-contracts/job-control'
import type { ExecutionJobDelivery, ExecutionJobDeliveryHandler, ExecutionJobQueue } from './types'

type QueueState = 'queued' | 'delivering' | 'retry-wait' | 'acked' | 'dead-lettered'

interface QueueRecord {
  deliveryId: string
  jobId: string
  candidate: unknown
  attempt: number
  state: QueueState
  deadLetterReason?: string
}

export interface InMemoryExecutionJobQueue extends ExecutionJobQueue {
  inject(candidate: unknown, jobId?: string): Promise<void>
  waitForIdle(): Promise<void>
  snapshot(): readonly Readonly<QueueRecord>[]
}

export function createInMemoryExecutionJobQueue(): InMemoryExecutionJobQueue {
  const records = new Map<string, QueueRecord>()
  const pending: QueueRecord[] = []
  const retryTimers = new Set<ReturnType<typeof setTimeout>>()
  let handler: ExecutionJobDeliveryHandler | undefined
  let drainPromise: Promise<void> | undefined
  let running = false

  function scheduleDrain(): void {
    if (!running || !handler || drainPromise) return
    drainPromise = drain().finally(() => {
      drainPromise = undefined
      if (pending.length > 0) scheduleDrain()
    })
  }

  async function drain(): Promise<void> {
    while (running && handler && pending.length > 0) {
      const record = pending.shift()!
      if (record.state !== 'queued') continue
      record.state = 'delivering'
      let settled = false
      const delivery: ExecutionJobDelivery = {
        deliveryId: record.deliveryId,
        attempt: record.attempt,
        candidate: record.candidate,
        async ack() {
          if (settled) return
          settled = true
          record.state = 'acked'
        },
        async retry(delayMs) {
          if (settled) return
          settled = true
          record.state = 'retry-wait'
          const timer = setTimeout(
            () => {
              retryTimers.delete(timer)
              if (!running) return
              record.attempt += 1
              record.state = 'queued'
              pending.push(record)
              scheduleDrain()
            },
            Math.max(0, delayMs)
          )
          timer.unref?.()
          retryTimers.add(timer)
        },
        async deadLetter(reason) {
          if (settled) return
          settled = true
          record.state = 'dead-lettered'
          record.deadLetterReason = reason
        },
      }
      try {
        await handler(delivery)
        if (!settled) await delivery.deadLetter('consumer_returned_without_disposition')
      } catch (error) {
        await delivery.deadLetter(
          error instanceof Error ? `consumer_error:${error.message}` : 'consumer_error'
        )
      }
    }
  }

  async function add(candidate: unknown, jobId: string): Promise<boolean> {
    if (records.has(jobId)) return true
    const record: QueueRecord = {
      deliveryId: randomUUID(),
      jobId,
      candidate,
      attempt: 1,
      state: 'queued',
    }
    records.set(jobId, record)
    pending.push(record)
    scheduleDrain()
    return false
  }

  return {
    async start(consumer) {
      if (running) return
      handler = consumer
      running = true
      scheduleDrain()
    },
    async stop() {
      running = false
      for (const timer of retryTimers) clearTimeout(timer)
      retryTimers.clear()
      await drainPromise
      handler = undefined
    },
    async submit(job): Promise<ExecutionJobAdmissionResponseV1> {
      const duplicate = await add(job, job.jobId)
      return {
        contractVersion: EXECUTION_CONTRACTS_VERSION,
        accepted: true,
        jobId: job.jobId,
        executionId: job.executionId,
        duplicate,
      }
    },
    async inject(candidate, jobId = `poison:${randomUUID()}`) {
      await add(candidate, jobId)
    },
    async waitForIdle() {
      while (drainPromise || pending.length > 0 || retryTimers.size > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1))
      }
    },
    snapshot() {
      return [...records.values()].map((record) => ({ ...record }))
    },
    async health() {
      return running
    },
  }
}

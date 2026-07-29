import type {
  ExecutionCancellationResponseV1,
  ExecutionJobAdmissionResponseV1,
} from '@sim/execution-contracts/job-control'
import type { ExecutionJobV1 } from '@sim/execution-contracts/jobs'

export interface ExecutionJobDelivery {
  deliveryId: string
  attempt: number
  candidate: unknown
  ack(): Promise<void>
  retry(delayMs: number): Promise<void>
  deadLetter(reason: string): Promise<void>
}

export type ExecutionJobDeliveryHandler = (delivery: ExecutionJobDelivery) => Promise<void>

export interface ExecutionJobQueue {
  start(handler: ExecutionJobDeliveryHandler): Promise<void>
  stop(): Promise<void>
  submit(job: ExecutionJobV1): Promise<ExecutionJobAdmissionResponseV1>
  health(): Promise<boolean>
}

export interface ExecutionJobCoordinator {
  handle(delivery: ExecutionJobDelivery): Promise<void>
  cancel(executionId: string, reason?: string): Promise<ExecutionCancellationResponseV1>
}

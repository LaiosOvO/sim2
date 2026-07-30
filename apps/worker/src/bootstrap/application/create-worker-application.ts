import {
  type ExecutionJobAdmissionResponseV1,
  type ExecutionJobV1,
  executionJobV1Schema,
  type RuntimeToolExecutionResultV1,
} from '@sim/execution-contracts'
import {
  type ApprovalEffectResultV1,
  approvalEffectCommandV1Schema,
} from '@sim/execution-contracts/approval-effects'
import {
  type ApprovalResumeResultV1,
  approvalResumeCommandV1Schema,
} from '@sim/execution-contracts/approval-resume'
import type { ExecutionCancellationResponseV1 } from '@sim/execution-contracts/job-control'
import { createWorkerRuntimeRegistry } from '@/bootstrap/composition/create-runtime-registry'
import type { ApprovalEffectsSink } from '@/jobs/approval/effects'
import type { ApprovalResumeRunner } from '@/jobs/approval/types'
import { createExecutionJobCoordinator } from '@/jobs/execution/create-execution-job-coordinator'
import { executeRuntimeToolJob } from '@/jobs/execution/execute-runtime-tool-job'
import { createInMemoryExecutionJobQueue } from '@/jobs/queue/in-memory-execution-job-queue'
import type { ExecutionJobCoordinator, ExecutionJobQueue } from '@/jobs/queue/types'
import type { ResumePoller } from '@/jobs/resume/types'
import { createInMemoryExecutionState } from '@/jobs/state/in-memory-execution-state'
import type {
  ExecutionEventReader,
  ExecutionEventSink,
  ExecutionJobStateStore,
} from '@/jobs/state/types'
import type { RuntimeToolRegistry } from '@/runtime/registry/types'
import type { SandboxExecution } from '@/sandbox/interface/types'
import { createRestrictedTestSandbox } from '@/sandbox/restricted-test/create-restricted-test-sandbox'

export interface WorkerApplication {
  start(): Promise<void>
  stop(): Promise<void>
  status(): 'idle' | 'running' | 'stopped'
  ready(): Promise<boolean>
  submitJob(candidate: unknown): Promise<ExecutionJobAdmissionResponseV1>
  cancelExecution(executionId: string, reason?: string): Promise<ExecutionCancellationResponseV1>
  executionEvents(
    executionId: string
  ): Promise<readonly import('@sim/execution-contracts').ExecutionEventV1[]>
  executeToolJob(job: ExecutionJobV1, signal?: AbortSignal): Promise<RuntimeToolExecutionResultV1>
  runResumePoll(
    candidate: unknown
  ): Promise<import('@sim/execution-contracts/resume-poll').ResumePollResultV1>
  resumeApproval(candidate: unknown): Promise<ApprovalResumeResultV1>
  enqueueApprovalEffect(candidate: unknown): Promise<ApprovalEffectResultV1>
}

export interface WorkerApplicationOptions {
  runtimeRegistry?: RuntimeToolRegistry
  jobQueue?: ExecutionJobQueue
  jobState?: ExecutionJobStateStore
  events?: ExecutionEventSink
  eventReader?: ExecutionEventReader
  sandbox?: SandboxExecution
  coordinator?: ExecutionJobCoordinator
  resumePoller?: ResumePoller
  approvalResume?: ApprovalResumeRunner
  approvalEffects?: ApprovalEffectsSink
  maxAttempts?: number
}

export class WorkerJobAdmissionFailure extends Error {
  constructor(
    readonly code: 'EXECUTION_JOB_INVALID' | 'WORKER_NOT_RUNNING',
    message: string
  ) {
    super(message)
    this.name = 'WorkerJobAdmissionFailure'
  }
}

/**
 * Creates the Worker lifecycle module. Queue adapters will be injected behind
 * this interface without exposing runtime or sandbox internals to callers.
 */
export function createWorkerApplication(options: WorkerApplicationOptions = {}): WorkerApplication {
  let currentStatus: ReturnType<WorkerApplication['status']> = 'idle'
  let keepAliveTimer: ReturnType<typeof setInterval> | undefined
  const runtimeRegistry = options.runtimeRegistry ?? createWorkerRuntimeRegistry()
  const queue = options.jobQueue ?? createInMemoryExecutionJobQueue()
  const defaultState = createInMemoryExecutionState()
  const state = options.jobState ?? defaultState
  const events = options.events ?? defaultState
  const eventReader = options.eventReader ?? defaultState
  const sandbox = options.sandbox ?? createRestrictedTestSandbox()
  const coordinator =
    options.coordinator ??
    createExecutionJobCoordinator({
      state,
      events,
      sandbox,
      maxAttempts: options.maxAttempts,
    })

  return {
    async start() {
      if (currentStatus === 'stopped') {
        throw new Error('A stopped worker application cannot be restarted')
      }
      if (currentStatus === 'running') return
      currentStatus = 'running'
      await queue.start((delivery) => coordinator.handle(delivery))
      keepAliveTimer = setInterval(() => undefined, 60_000)
    },
    async stop() {
      if (keepAliveTimer) clearInterval(keepAliveTimer)
      keepAliveTimer = undefined
      await queue.stop()
      currentStatus = 'stopped'
    },
    status() {
      return currentStatus
    },
    async ready() {
      if (currentStatus !== 'running') return false
      const [queueReady, sandboxReady] = await Promise.all([queue.health(), sandbox.health()])
      return queueReady && sandboxReady
    },
    async submitJob(candidate) {
      if (currentStatus !== 'running') {
        throw new WorkerJobAdmissionFailure('WORKER_NOT_RUNNING', 'Worker is not running')
      }
      const parsed = executionJobV1Schema.safeParse(candidate)
      if (!parsed.success) {
        throw new WorkerJobAdmissionFailure(
          'EXECUTION_JOB_INVALID',
          'Execution job does not match the versioned contract'
        )
      }
      return queue.submit(parsed.data)
    },
    cancelExecution(executionId, reason) {
      return coordinator.cancel(executionId, reason)
    },
    async executionEvents(executionId) {
      return eventReader.list(executionId)
    },
    executeToolJob(job, signal) {
      return executeRuntimeToolJob(job, runtimeRegistry, signal)
    },
    async runResumePoll(candidate) {
      if (currentStatus !== 'running') {
        throw new WorkerJobAdmissionFailure('WORKER_NOT_RUNNING', 'Worker is not running')
      }
      const { resumePollCommandV1Schema } = await import('@sim/execution-contracts/resume-poll')
      const parsed = resumePollCommandV1Schema.safeParse(candidate)
      if (!parsed.success) {
        throw new WorkerJobAdmissionFailure(
          'EXECUTION_JOB_INVALID',
          'Resume poll command does not match the versioned contract'
        )
      }
      if (!options.resumePoller) throw new Error('Resume poller is not configured')
      return options.resumePoller.run(parsed.data)
    },
    async resumeApproval(candidate) {
      if (currentStatus !== 'running') {
        throw new WorkerJobAdmissionFailure('WORKER_NOT_RUNNING', 'Worker is not running')
      }
      const parsed = approvalResumeCommandV1Schema.safeParse(candidate)
      if (!parsed.success) {
        throw new WorkerJobAdmissionFailure(
          'EXECUTION_JOB_INVALID',
          'Approval resume command does not match the versioned contract'
        )
      }
      if (!options.approvalResume) throw new Error('Approval resume runner is not configured')
      return options.approvalResume.execute(parsed.data)
    },
    async enqueueApprovalEffect(candidate) {
      if (currentStatus !== 'running') {
        throw new WorkerJobAdmissionFailure('WORKER_NOT_RUNNING', 'Worker is not running')
      }
      const parsed = approvalEffectCommandV1Schema.safeParse(candidate)
      if (!parsed.success) {
        throw new WorkerJobAdmissionFailure(
          'EXECUTION_JOB_INVALID',
          'Approval effect command does not match the versioned contract'
        )
      }
      if (!options.approvalEffects) throw new Error('Approval effects sink is not configured')
      return options.approvalEffects.enqueue(parsed.data)
    },
  }
}

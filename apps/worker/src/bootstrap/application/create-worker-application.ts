import type { ExecutionJobV1, RuntimeToolExecutionResultV1 } from '@sim/execution-contracts'
import { createWorkerRuntimeRegistry } from '@/bootstrap/composition/create-runtime-registry'
import { executeRuntimeToolJob } from '@/jobs/execution/execute-runtime-tool-job'
import type { RuntimeToolRegistry } from '@/runtime/registry/types'

export interface WorkerApplication {
  start(): Promise<void>
  stop(): Promise<void>
  status(): 'idle' | 'running' | 'stopped'
  executeToolJob(job: ExecutionJobV1, signal?: AbortSignal): Promise<RuntimeToolExecutionResultV1>
}

export interface WorkerApplicationOptions {
  runtimeRegistry?: RuntimeToolRegistry
}

/**
 * Creates the Worker lifecycle module. Queue adapters will be injected behind
 * this interface without exposing runtime or sandbox internals to callers.
 */
export function createWorkerApplication(options: WorkerApplicationOptions = {}): WorkerApplication {
  let currentStatus: ReturnType<WorkerApplication['status']> = 'idle'
  let keepAliveTimer: ReturnType<typeof setInterval> | undefined
  const runtimeRegistry = options.runtimeRegistry ?? createWorkerRuntimeRegistry()

  return {
    async start() {
      if (currentStatus === 'stopped') {
        throw new Error('A stopped worker application cannot be restarted')
      }
      currentStatus = 'running'
      keepAliveTimer = setInterval(() => undefined, 60_000)
    },
    async stop() {
      if (keepAliveTimer) clearInterval(keepAliveTimer)
      keepAliveTimer = undefined
      currentStatus = 'stopped'
    },
    status() {
      return currentStatus
    },
    executeToolJob(job, signal) {
      return executeRuntimeToolJob(job, runtimeRegistry, signal)
    },
  }
}

export interface WorkerApplication {
  start(): Promise<void>
  stop(): Promise<void>
  status(): 'idle' | 'running' | 'stopped'
}

/**
 * Creates the Worker lifecycle module. Queue adapters will be injected behind
 * this interface without exposing runtime or sandbox internals to callers.
 */
export function createWorkerApplication(): WorkerApplication {
  let currentStatus: ReturnType<WorkerApplication['status']> = 'idle'
  let keepAliveTimer: ReturnType<typeof setInterval> | undefined

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
  }
}

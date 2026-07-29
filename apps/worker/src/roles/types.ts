export interface StartedWorkerRole {
  name: 'execution' | 'sandbox'
  port: number
  stop(): Promise<void>
}

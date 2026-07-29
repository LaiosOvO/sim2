import { createLogger } from '@sim/logger'
import type { StartedWorkerRole } from '@/roles/types'

const logger = createLogger('WorkerBootstrap')
const roleArgument = process.argv.find((argument) => argument.startsWith('--role='))?.slice(7)
const roleName =
  roleArgument === 'sandbox' || process.env.WORKER_ROLE === 'sandbox' ? 'sandbox' : 'execution'

const role: StartedWorkerRole =
  roleName === 'sandbox'
    ? await import('@/roles/sandbox/start-sandbox-role').then((module) => module.startSandboxRole())
    : await import('@/roles/execution/start-execution-role').then((module) =>
        module.startExecutionRole()
      )

logger.info('Worker role started', {
  port: role.port,
  role: role.name,
  admissionConfigured: Boolean(process.env.INTERNAL_EXECUTION_TOKEN?.trim()),
})

async function shutdown(signal: string): Promise<void> {
  logger.info('Worker role shutting down', { role: role.name, signal })
  await role.stop()
}

process.once('SIGINT', () => {
  void shutdown('SIGINT')
})
process.once('SIGTERM', () => {
  void shutdown('SIGTERM')
})

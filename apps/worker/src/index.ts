import { createLogger } from '@sim/logger'
import { createWorkerApplication } from '@/bootstrap/application/create-worker-application'

const logger = createLogger('WorkerBootstrap')
const application = createWorkerApplication()

await application.start()
logger.info('Worker application started')

async function shutdown(signal: string): Promise<void> {
  logger.info('Worker application shutting down', { signal })
  await application.stop()
}

process.once('SIGINT', () => {
  void shutdown('SIGINT')
})
process.once('SIGTERM', () => {
  void shutdown('SIGTERM')
})

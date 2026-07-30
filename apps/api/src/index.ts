import { createLogger } from '@sim/logger'
import { createApiApplication } from '@/bootstrap/application/create-api-application'
import { createProductionApiOptions } from '@/bootstrap/composition/create-production-api-options'
import { createHttpServer } from '@/bootstrap/lifecycle/create-http-server'

const logger = createLogger('ApiBootstrap')
const application = createApiApplication(await createProductionApiOptions())
const server = createHttpServer(application)
const port = Number.parseInt(process.env.API_PORT ?? '3012', 10)

server.listen(port, () => {
  logger.info('API server listening', { port })
})

async function shutdown(signal: string): Promise<void> {
  logger.info('API server shutting down', { signal })
  try {
    const { shutdownEnvironmentTelemetry } = await import(
      '@/modules/environment/infrastructure/posthog-environment-event-sink'
    )
    await shutdownEnvironmentTelemetry()
  } catch (error) {
    logger.warn('API telemetry shutdown failed', { error })
  }
  server.close((error) => {
    if (error) {
      logger.error('API server shutdown failed', error)
      process.exitCode = 1
    }
  })
}

process.once('SIGINT', () => void shutdown('SIGINT'))
process.once('SIGTERM', () => void shutdown('SIGTERM'))

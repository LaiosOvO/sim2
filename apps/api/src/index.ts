import { createLogger } from '@sim/logger'
import { createApiApplication } from '@/bootstrap/application/create-api-application'
import { createHttpServer } from '@/bootstrap/lifecycle/create-http-server'

const logger = createLogger('ApiBootstrap')
const application = createApiApplication()
const server = createHttpServer(application)
const port = Number.parseInt(process.env.API_PORT ?? '3002', 10)

server.listen(port, () => {
  logger.info('API server listening', { port })
})

function shutdown(signal: string): void {
  logger.info('API server shutting down', { signal })
  server.close((error) => {
    if (error) {
      logger.error('API server shutdown failed', error)
      process.exitCode = 1
    }
  })
}

process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))

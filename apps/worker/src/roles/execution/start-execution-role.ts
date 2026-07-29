import { once } from 'node:events'
import { createWorkerApplication } from '@/bootstrap/application/create-worker-application'
import { createWorkerHttpServer } from '@/http/create-worker-http-server'
import type { StartedWorkerRole } from '@/roles/types'
import { createLoggerSandboxAudit } from '@/sandbox/audit/create-logger-sandbox-audit'
import type { SandboxExecution } from '@/sandbox/interface/types'
import { createRestrictedTestSandbox } from '@/sandbox/restricted-test/create-restricted-test-sandbox'
import { createUnavailableSandbox } from '@/sandbox/unavailable/create-unavailable-sandbox'

async function sandboxFromEnvironment(): Promise<SandboxExecution | undefined> {
  const baseUrl = process.env.SANDBOX_SERVICE_URL?.trim()
  const internalToken = process.env.INTERNAL_EXECUTION_TOKEN?.trim()
  if (!baseUrl || !internalToken) return undefined
  const { createHttpSandbox } = await import('@/sandbox/http/create-http-sandbox')
  return createHttpSandbox({ baseUrl, internalToken })
}

export async function startExecutionRole(): Promise<StartedWorkerRole> {
  const port = Number.parseInt(process.env.WORKER_PORT ?? '3003', 10)
  const internalToken = process.env.INTERNAL_EXECUTION_TOKEN?.trim()
  const remoteSandbox = await sandboxFromEnvironment()
  const restrictedSandboxEnabled = process.env.ENABLE_RESTRICTED_TEST_SANDBOX === '1'
  const application = createWorkerApplication({
    sandbox:
      remoteSandbox ??
      (restrictedSandboxEnabled
        ? createRestrictedTestSandbox(createLoggerSandboxAudit())
        : createUnavailableSandbox(
            'Configure SANDBOX_SERVICE_URL or explicitly enable the restricted test Sandbox'
          )),
  })
  await application.start()
  const server = createWorkerHttpServer({ application, internalToken })
  server.listen(port)
  await once(server, 'listening')

  return {
    name: 'execution',
    port,
    async stop() {
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await application.stop()
    },
  }
}

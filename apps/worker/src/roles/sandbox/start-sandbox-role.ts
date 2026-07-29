import { once } from 'node:events'
import { createSandboxHttpServer } from '@/http/create-sandbox-http-server'
import type { StartedWorkerRole } from '@/roles/types'
import { createLoggerSandboxAudit } from '@/sandbox/audit/create-logger-sandbox-audit'
import { createRestrictedTestSandbox } from '@/sandbox/restricted-test/create-restricted-test-sandbox'
import { createUnavailableSandbox } from '@/sandbox/unavailable/create-unavailable-sandbox'

export async function startSandboxRole(): Promise<StartedWorkerRole> {
  const port = Number.parseInt(process.env.SANDBOX_PORT ?? '3004', 10)
  const internalToken = process.env.INTERNAL_EXECUTION_TOKEN?.trim()
  const sandbox =
    process.env.ENABLE_RESTRICTED_TEST_SANDBOX === '1'
      ? createRestrictedTestSandbox(createLoggerSandboxAudit())
      : createUnavailableSandbox(
          'Restricted test Sandbox is disabled; configure a production Sandbox adapter'
        )
  const server = createSandboxHttpServer({ sandbox, internalToken })
  server.listen(port)
  await once(server, 'listening')

  return {
    name: 'sandbox',
    port,
    async stop() {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}

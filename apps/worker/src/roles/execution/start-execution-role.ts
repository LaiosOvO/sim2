import { once } from 'node:events'
import { createWorkerApplication } from '@/bootstrap/application/create-worker-application'
import { createWorkerHttpServer } from '@/http/create-worker-http-server'
import { createDrizzleApprovalEffectsSink } from '@/jobs/approval/drizzle-approval-effects-sink'
import { createHttpApprovalResumeRunner } from '@/jobs/approval/http-approval-resume-runner'
import { createUnavailableApprovalResumeRunner } from '@/jobs/approval/unavailable-approval-resume-runner'
import { createInMemoryExecutionJobQueue } from '@/jobs/queue/in-memory-execution-job-queue'
import { createDrizzleResumePoller } from '@/jobs/resume/create-drizzle-resume-poller'
import { createHttpResumeExecutionRunner } from '@/jobs/resume/http-resume-execution-runner'
import { createUnavailableResumeExecutionRunner } from '@/jobs/resume/resume-execution-runner'
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
  const legacyResumeExecutionBaseUrl = process.env.RESUME_EXECUTION_SERVICE_URL?.trim()
  const resumeExecutionBaseUrl =
    legacyResumeExecutionBaseUrl ?? process.env.SANDBOX_SERVICE_URL?.trim()
  const approvalResumeBaseUrl =
    process.env.APPROVAL_RESUME_SERVICE_URL?.trim() ?? legacyResumeExecutionBaseUrl
  const restrictedSandboxEnabled = process.env.ENABLE_RESTRICTED_TEST_SANDBOX === '1'
  const jobQueue = createInMemoryExecutionJobQueue()
  const application = createWorkerApplication({
    jobQueue,
    approvalEffects: createDrizzleApprovalEffectsSink(),
    approvalResume:
      approvalResumeBaseUrl && internalToken
        ? createHttpApprovalResumeRunner({
            baseUrl: approvalResumeBaseUrl,
            internalToken,
          })
        : createUnavailableApprovalResumeRunner(
            'Configure APPROVAL_RESUME_SERVICE_URL for approval resume execution'
          ),
    resumePoller: createDrizzleResumePoller({
      runner:
        resumeExecutionBaseUrl && internalToken
          ? createHttpResumeExecutionRunner({
              baseUrl: resumeExecutionBaseUrl,
              internalToken,
              path: legacyResumeExecutionBaseUrl ? '/api/internal/resume/execute' : undefined,
            })
          : createUnavailableResumeExecutionRunner(
              'Configure RESUME_EXECUTION_SERVICE_URL for durable resume execution'
            ),
    }),
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

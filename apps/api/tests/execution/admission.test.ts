import type { ExecutionJobV1 } from '@sim/execution-contracts/jobs'
import { describe, expect, it, vi } from 'vitest'
import { createApiApplication } from '@/bootstrap/application/create-api-application'
import { createExecutionAdmissionModule } from '@/modules/execution/application/create-execution-admission-module'
import type { ExecutionJobSubmitter } from '@/modules/execution/application/ports'

function job(): ExecutionJobV1 {
  return {
    contractVersion: 1,
    jobId: 'job-api-1',
    executionId: 'execution-api-1',
    workspaceId: 'workspace-1',
    workflowId: 'workflow-1',
    kind: 'run',
    requestedAt: '2026-07-30T00:00:00.000Z',
    trace: {
      traceId: 'a'.repeat(32),
      spanId: 'b'.repeat(16),
      traceFlags: '01',
      correlationId: 'request-api-1',
    },
    payload: {
      contractVersion: 1,
      type: 'sandbox-test',
      operation: 'echo',
      input: { submitted: true },
      policy: {
        contractVersion: 1,
        network: 'deny',
        filesystem: {
          mode: 'ephemeral',
          readOnlyMounts: [],
          writableRoot: '/tmp/job',
        },
        cpuTimeMs: 100,
        memoryMiB: 32,
        wallClockMs: 1_000,
        maxInputBytes: 1_024,
        secrets: {
          mode: 'references-only',
          credentialRefs: [],
        },
      },
    },
  }
}

describe('API execution admission', () => {
  it('authenticates and submits only the versioned restricted test contract', async () => {
    const submitter: ExecutionJobSubmitter = {
      submit: vi.fn(async (submitted: ExecutionJobV1) => ({
        contractVersion: 1 as const,
        accepted: true as const,
        jobId: submitted.jobId,
        executionId: submitted.executionId,
        duplicate: false,
      })),
      cancel: vi.fn(async (executionId: string) => ({
        contractVersion: 1 as const,
        executionId,
        requested: true as const,
        duplicate: false,
      })),
    }
    const application = createApiApplication({
      executionAdmission: createExecutionAdmissionModule({
        internalToken: 'api-test-token',
        submitter,
      }),
    })

    const unauthorized = await application.handle(
      new Request('http://api.test/internal/execution/jobs', {
        method: 'POST',
        body: JSON.stringify(job()),
      })
    )
    expect(unauthorized.status).toBe(401)

    const response = await application.handle(
      new Request('http://api.test/internal/execution/jobs', {
        method: 'POST',
        headers: {
          authorization: 'Bearer api-test-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify(job()),
      })
    )
    expect(response.status).toBe(202)
    expect(await response.json()).toMatchObject({
      accepted: true,
      jobId: 'job-api-1',
    })
    expect(submitter.submit).toHaveBeenCalledOnce()
  })
})

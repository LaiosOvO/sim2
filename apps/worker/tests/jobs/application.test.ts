import { describe, expect, it } from 'vitest'
import { createWorkerApplication } from '@/bootstrap/application/create-worker-application'
import { executionTraceFromJob } from '@/observability/execution-trace'

describe('Worker application interface', () => {
  it('owns its lifecycle state', async () => {
    const application = createWorkerApplication()

    expect(application.status()).toBe('idle')
    await application.start()
    expect(application.status()).toBe('running')
    await application.stop()
    expect(application.status()).toBe('stopped')
    await expect(application.start()).rejects.toThrow('cannot be restarted')
  })

  it('reads the same trace contract carried by an execution job', () => {
    const trace = executionTraceFromJob({
      contractVersion: 1,
      jobId: 'job-1',
      executionId: 'execution-1',
      workspaceId: 'workspace-1',
      workflowId: 'workflow-1',
      kind: 'run',
      requestedAt: '2026-07-30T00:00:00.000Z',
      trace: {
        traceId: 'a'.repeat(32),
        spanId: 'b'.repeat(16),
        traceFlags: '01',
        correlationId: 'request-1',
      },
      payload: {},
    })

    expect(trace.correlationId).toBe('request-1')
  })
})

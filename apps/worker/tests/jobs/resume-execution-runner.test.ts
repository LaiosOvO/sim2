import { EXECUTION_CONTRACTS_VERSION } from '@sim/execution-contracts'
import { describe, expect, it } from 'vitest'
import { createHttpResumeExecutionRunner } from '@/jobs/resume/http-resume-execution-runner'

const command = {
  contractVersion: EXECUTION_CONTRACTS_VERSION,
  resumeEntryId: 'resume-entry-1',
  pausedExecutionId: 'paused-1',
  workflowId: 'workflow-1',
  executionId: 'execution-1',
  contextId: 'context-1',
  userId: 'user-1',
  workspaceId: 'workspace-1',
  snapshot: { snapshot: '{}' },
  input: {},
}

describe('HTTP resume execution runner', () => {
  it('uses the configured legacy bridge path and entry idempotency key', async () => {
    let capturedUrl = ''
    let capturedInit: RequestInit | undefined
    const fetcher: typeof fetch = async (input, init) => {
      capturedUrl = String(input)
      capturedInit = init
      return Response.json({
        contractVersion: EXECUTION_CONTRACTS_VERSION,
        ok: true,
        status: 'completed',
        output: { resumed: true },
      })
    }
    const runner = createHttpResumeExecutionRunner({
      baseUrl: 'http://legacy-sim.test',
      internalToken: 'internal-token',
      path: '/api/internal/resume/execute',
      fetcher,
    })
    await expect(runner.execute(command)).resolves.toMatchObject({
      ok: true,
      status: 'completed',
    })
    expect(capturedUrl).toBe('http://legacy-sim.test/api/internal/resume/execute')
    expect(new Headers(capturedInit?.headers).get('idempotency-key')).toBe('resume-entry-1')
    expect(JSON.parse(String(capturedInit?.body))).toEqual(command)
  })

  it('classifies execution-service 5xx responses as retryable', async () => {
    const runner = createHttpResumeExecutionRunner({
      baseUrl: 'http://resume.test',
      internalToken: 'internal-token',
      fetcher: async () => new Response(null, { status: 503 }),
    })
    await expect(runner.execute(command)).resolves.toMatchObject({
      ok: false,
      retryable: true,
      error: 'Resume execution service failed with 503',
    })
  })
})

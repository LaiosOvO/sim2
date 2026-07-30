import { EXECUTION_CONTRACTS_VERSION } from '@sim/execution-contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { executeResumeJob } = vi.hoisted(() => ({
  executeResumeJob: vi.fn(),
}))

vi.mock('@/background/resume-execution', () => ({ executeResumeJob }))
vi.mock('@/lib/core/config/env', () => ({
  env: {
    INTERNAL_EXECUTION_TOKEN: 'internal-execution-token-at-least-32-chars',
    INTERNAL_API_SECRET: 'fallback-internal-api-secret-32-chars',
  },
}))

import { POST } from './route'

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

function request(body: unknown, token = 'internal-execution-token-at-least-32-chars') {
  return new Request('http://sim.test/api/internal/resume/execute', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'idempotency-key': command.resumeEntryId,
    },
    body: JSON.stringify(body),
  })
}

describe('internal resume execution bridge', () => {
  beforeEach(() => {
    executeResumeJob.mockReset()
    executeResumeJob.mockResolvedValue({
      success: true,
      status: 'completed',
      output: { resumed: true },
    })
  })

  it('executes the already-claimed entry with the parent execution ID', async () => {
    const response = await POST(request(command))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      contractVersion: EXECUTION_CONTRACTS_VERSION,
      ok: true,
      status: 'completed',
      output: { resumed: true },
    })
    expect(executeResumeJob).toHaveBeenCalledWith({
      resumeEntryId: 'resume-entry-1',
      resumeExecutionId: 'execution-1',
      pausedExecutionId: 'paused-1',
      contextId: 'context-1',
      resumeInput: {},
      userId: 'user-1',
      workflowId: 'workflow-1',
      parentExecutionId: 'execution-1',
    })
  })

  it('rejects invalid authentication, contract versions, and idempotency keys', async () => {
    await expect(POST(request(command, 'wrong-token'))).resolves.toMatchObject({ status: 401 })
    await expect(POST(request({ ...command, contractVersion: 999 }))).resolves.toMatchObject({
      status: 400,
    })
    const wrongKey = request(command)
    wrongKey.headers.set('idempotency-key', 'other-entry')
    await expect(POST(wrongKey)).resolves.toMatchObject({ status: 400 })
    const oversized = request(command)
    oversized.headers.set('content-length', String(40 * 1024 * 1024 + 1))
    await expect(POST(oversized)).resolves.toMatchObject({ status: 413 })
    expect(executeResumeJob).not.toHaveBeenCalled()
  })
})

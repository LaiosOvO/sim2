import { EXECUTION_CONTRACTS_VERSION } from '@sim/execution-contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { materializeExecutionData } = vi.hoisted(() => ({
  materializeExecutionData: vi.fn(),
}))

vi.mock('@/lib/logs/execution/trace-store', () => ({ materializeExecutionData }))
vi.mock('@/lib/core/config/env', () => ({
  env: {
    INTERNAL_EXECUTION_TOKEN: 'internal-execution-token-at-least-32-chars',
    INTERNAL_API_SECRET: 'fallback-internal-api-secret-32-chars',
  },
}))

import { POST } from './route'

const command = {
  contractVersion: EXECUTION_CONTRACTS_VERSION,
  requestId: 'request-1',
  workspaceId: 'workspace-1',
  workflowId: 'workflow-1',
  executionId: 'execution-1',
  reference: {
    __simLargeValueRef: true,
    version: 1,
    id: 'lv_abcdefghijkl',
    kind: 'object',
    size: 4096,
    key: 'execution/workspace-1/workflow-1/execution-1/large-value-lv_abcdefghijkl.json',
    executionId: 'execution-1',
  },
}

function request(body: unknown, token = 'internal-execution-token-at-least-32-chars') {
  return new Request('http://sim.test/api/internal/execution-objects/read', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

describe('internal execution object read route', () => {
  beforeEach(() => {
    materializeExecutionData.mockReset()
    materializeExecutionData.mockResolvedValue({
      __simInternalExecutionObjectReadProbe: true,
      finalOutput: { answer: 42 },
    })
  })

  it('uses the donor materializer behind a versioned authenticated route', async () => {
    const response = await POST(request(command))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      contractVersion: EXECUTION_CONTRACTS_VERSION,
      requestId: 'request-1',
      status: 'found',
      data: { finalOutput: { answer: 42 } },
    })
    expect(materializeExecutionData).toHaveBeenCalledWith(
      expect.objectContaining({ traceStoreRef: command.reference }),
      {
        workspaceId: 'workspace-1',
        workflowId: 'workflow-1',
        executionId: 'execution-1',
      }
    )
  })

  it('returns versioned missing/unavailable states and rejects invalid callers', async () => {
    materializeExecutionData.mockResolvedValueOnce({
      __simInternalExecutionObjectReadProbe: true,
    })
    const missing = await POST(request(command))
    expect(missing.status).toBe(404)
    expect(await missing.json()).toMatchObject({ status: 'missing', requestId: 'request-1' })

    materializeExecutionData.mockRejectedValueOnce(new Error('storage unavailable'))
    const unavailable = await POST(request(command))
    expect(unavailable.status).toBe(503)
    expect(await unavailable.json()).toMatchObject({
      status: 'unavailable',
      error: 'storage unavailable',
    })

    await expect(POST(request(command, 'wrong-token'))).resolves.toMatchObject({ status: 401 })
    await expect(POST(request({ ...command, contractVersion: 999 }))).resolves.toMatchObject({
      status: 400,
    })
  })
})

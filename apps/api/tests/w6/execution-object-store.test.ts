import { describe, expect, it } from 'vitest'
import { createHttpExecutionObjectStore } from '@/modules/execution/control/infrastructure/http-execution-object-store'

const reference = {
  __simLargeValueRef: true as const,
  version: 1 as const,
  id: 'lv_abcdefghijkl',
  kind: 'object' as const,
  size: 4096,
  key: 'execution/workspace-1/workflow-1/execution-1/large-value-lv_abcdefghijkl.json',
  executionId: 'execution-1',
}

describe('execution object-store HTTP boundary', () => {
  it('forwards the authorized execution scope and parses a bounded object', async () => {
    let capturedUrl = ''
    let capturedInit: RequestInit | undefined
    const fetcher: typeof fetch = async (input, init) => {
      capturedUrl = String(input)
      capturedInit = init
      const command = JSON.parse(String(init?.body))
      const body = JSON.stringify({
        contractVersion: 1,
        requestId: command.requestId,
        status: 'found',
        data: { finalOutput: { answer: 42 } },
      })
      return new Response(body, {
        status: 200,
        headers: { 'content-length': String(Buffer.byteLength(body)) },
      })
    }
    const objects = createHttpExecutionObjectStore({
      baseUrl: 'http://object-store.test',
      internalToken: 'internal-token',
      fetcher,
    })
    await expect(
      objects.readJson({
        reference,
        workspaceId: 'workspace-1',
        workflowId: 'workflow-1',
        executionId: 'execution-1',
      })
    ).resolves.toEqual({ finalOutput: { answer: 42 } })
    expect(capturedUrl).toBe('http://object-store.test/api/internal/execution-objects/read')
    expect(new Headers(capturedInit?.headers).get('authorization')).toBe('Bearer internal-token')
    expect(JSON.parse(String(capturedInit?.body))).toMatchObject({
      workspaceId: 'workspace-1',
      workflowId: 'workflow-1',
      executionId: 'execution-1',
    })
  })

  it('degrades 404 to missing and rejects an oversized response', async () => {
    const missing = createHttpExecutionObjectStore({
      baseUrl: 'http://object-store.test',
      internalToken: 'internal-token',
      fetcher: async (_input, init) => {
        const command = JSON.parse(String(init?.body))
        return Response.json(
          {
            contractVersion: 1,
            requestId: command.requestId,
            status: 'missing',
          },
          { status: 404 }
        )
      },
    })
    await expect(
      missing.readJson({
        reference,
        workspaceId: 'workspace-1',
        workflowId: 'workflow-1',
        executionId: 'execution-1',
      })
    ).resolves.toBeNull()

    const oversized = createHttpExecutionObjectStore({
      baseUrl: 'http://object-store.test',
      internalToken: 'internal-token',
      fetcher: async () =>
        new Response('{"large":true}', {
          status: 200,
          headers: { 'content-length': '100000' },
        }),
    })
    await expect(
      oversized.readJson({
        reference,
        workspaceId: 'workspace-1',
        workflowId: 'workflow-1',
        executionId: 'execution-1',
      })
    ).rejects.toThrow('exceeds its limit')
  })
})

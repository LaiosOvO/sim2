import { describe, expect, it, vi } from 'vitest'
import { createTriggerJobStatusReader } from '@/modules/execution/control/infrastructure/trigger-job-status-reader'

describe('Trigger.dev job-status adapter', () => {
  it('retrieves a run over the narrow HTTP API and maps donor status/metadata', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        status: 'COMPLETED',
        payload: {
          workflowId: 'workflow-1',
          userId: 'user-1',
          correlation: { requestId: 'request-1' },
        },
        output: { answer: 42 },
      })
    )
    const reader = createTriggerJobStatusReader({
      secretKey: 'trigger-secret',
      baseUrl: 'https://trigger.test',
      fetcher,
    })
    await expect(reader.read('run-1')).resolves.toEqual({
      id: 'run-1',
      status: 'completed',
      metadata: {
        workflowId: 'workflow-1',
        userId: 'user-1',
        correlation: { requestId: 'request-1' },
      },
      output: { answer: 42 },
    })
    expect(fetcher).toHaveBeenCalledWith(
      new URL('https://trigger.test/api/v3/runs/run-1'),
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer trigger-secret' }),
      })
    )
  })

  it('maps a provider 404 to a missing task', async () => {
    const reader = createTriggerJobStatusReader({
      secretKey: 'trigger-secret',
      fetcher: vi.fn(async () => new Response(null, { status: 404 })),
    })
    await expect(reader.read('missing')).resolves.toBeNull()
  })
})

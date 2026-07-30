import { EXECUTION_CONTRACTS_VERSION } from '@sim/execution-contracts'
import { describe, expect, it, vi } from 'vitest'
import { createWorkerApplication } from '@/bootstrap/application/create-worker-application'

describe('Worker resume-poll command', () => {
  it('validates the versioned command and delegates state advancement to its poller', async () => {
    const run = vi.fn(async (command) => ({
      contractVersion: EXECUTION_CONTRACTS_VERSION,
      commandId: command.commandId,
      status: 'completed' as const,
      claimedRows: 2,
      dispatched: 2,
      failures: [],
    }))
    const worker = createWorkerApplication({ resumePoller: { run } })
    await worker.start()
    const result = await worker.runResumePoll({
      contractVersion: EXECUTION_CONTRACTS_VERSION,
      commandId: 'poll-1',
      requestedAt: '2026-07-30T00:00:00.000Z',
    })
    expect(result.dispatched).toBe(2)
    expect(run).toHaveBeenCalledOnce()
    await worker.stop()
  })

  it('rejects an unversioned command before calling the poller', async () => {
    const run = vi.fn()
    const worker = createWorkerApplication({ resumePoller: { run } })
    await worker.start()
    await expect(worker.runResumePoll({ commandId: 'poll-1' })).rejects.toMatchObject({
      code: 'EXECUTION_JOB_INVALID',
    })
    expect(run).not.toHaveBeenCalled()
    await worker.stop()
  })
})

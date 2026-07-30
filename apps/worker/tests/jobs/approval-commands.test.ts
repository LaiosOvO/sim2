import { EXECUTION_CONTRACTS_VERSION } from '@sim/execution-contracts'
import { describe, expect, it, vi } from 'vitest'
import { createWorkerApplication } from '@/bootstrap/application/create-worker-application'

describe('Worker approval commands', () => {
  it('delegates approval resume to the configured runner', async () => {
    const execute = vi.fn(async (command) => ({
      contractVersion: EXECUTION_CONTRACTS_VERSION,
      commandId: command.commandId,
      status: 'resuming' as const,
      resumeExecutionId: command.executionId,
    }))
    const application = createWorkerApplication({
      approvalResume: { execute },
    })
    await application.start()
    const result = await application.resumeApproval({
      contractVersion: EXECUTION_CONTRACTS_VERSION,
      commandId: 'command-1',
      approvalId: 'approval-1',
      workflowId: 'workflow-1',
      executionId: 'execution-1',
      contextId: 'context-1',
      decision: 'approved',
    })
    expect(result.status).toBe('resuming')
    expect(execute).toHaveBeenCalledOnce()
    await application.stop()
  })

  it('delegates side effects to a durable sink and rejects unversioned input', async () => {
    const enqueue = vi.fn(async (command) => ({
      contractVersion: EXECUTION_CONTRACTS_VERSION,
      commandId: command.commandId,
      status: 'queued' as const,
      outboxId: 'outbox-1',
    }))
    const application = createWorkerApplication({
      approvalEffects: { enqueue },
    })
    await application.start()
    await expect(
      application.enqueueApprovalEffect({
        commandId: 'missing-version',
        event: 'approval.started',
      })
    ).rejects.toMatchObject({ code: 'EXECUTION_JOB_INVALID' })
    await expect(
      application.enqueueApprovalEffect({
        contractVersion: EXECUTION_CONTRACTS_VERSION,
        commandId: 'command-2',
        idempotencyKey: 'approval-1:started',
        event: 'approval.started',
        approvalId: 'approval-1',
      })
    ).resolves.toMatchObject({ status: 'queued', outboxId: 'outbox-1' })
    expect(enqueue).toHaveBeenCalledOnce()
    await application.stop()
  })
})

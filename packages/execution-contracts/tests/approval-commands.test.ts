import { describe, expect, it } from 'vitest'
import {
  approvalEffectCommandV1Schema,
  approvalEffectResultV1Schema,
} from '../src/approval-effects'
import { approvalResumeCommandV1Schema, approvalResumeResultV1Schema } from '../src/approval-resume'
import { EXECUTION_CONTRACTS_VERSION } from '../src/version'

describe('approval Worker commands', () => {
  it('round-trips the versioned resume command and result', () => {
    const command = approvalResumeCommandV1Schema.parse({
      contractVersion: EXECUTION_CONTRACTS_VERSION,
      commandId: 'command-1',
      approvalId: 'approval-1',
      workflowId: 'workflow-1',
      executionId: 'execution-1',
      contextId: 'context-1',
      decision: 'approved',
    })
    expect(
      approvalResumeResultV1Schema.parse({
        contractVersion: EXECUTION_CONTRACTS_VERSION,
        commandId: command.commandId,
        status: 'queued',
        resumeExecutionId: command.executionId,
      }).resumeExecutionId
    ).toBe('execution-1')
  })

  it('keeps Feishu/Meegle outside the durable effect command', () => {
    const result = approvalEffectCommandV1Schema.safeParse({
      contractVersion: EXECUTION_CONTRACTS_VERSION,
      commandId: 'command-2',
      idempotencyKey: 'approval-1:started',
      event: 'approval.started',
      approvalId: 'approval-1',
      workspaceId: 'workspace-1',
      taskIds: ['task-1'],
      feishuToken: 'must-not-cross-contract',
    })
    expect(result.success).toBe(false)
    expect(
      approvalEffectResultV1Schema.parse({
        contractVersion: EXECUTION_CONTRACTS_VERSION,
        commandId: 'command-2',
        status: 'queued',
        outboxId: 'outbox-1',
      }).status
    ).toBe('queued')
  })
})

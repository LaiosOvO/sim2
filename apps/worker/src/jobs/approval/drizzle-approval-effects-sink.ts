import { db } from '@sim/db'
import { approvalEffectOutbox } from '@sim/db/schema'
import { EXECUTION_CONTRACTS_VERSION } from '@sim/execution-contracts'
import type {
  ApprovalEffectCommandV1,
  ApprovalEffectResultV1,
} from '@sim/execution-contracts/approval-effects'
import { generateId } from '@sim/utils/id'
import { eq } from 'drizzle-orm'
import type { ApprovalEffectsSink } from '@/jobs/approval/effects'

export function createDrizzleApprovalEffectsSink(): ApprovalEffectsSink {
  return {
    async enqueue(command: ApprovalEffectCommandV1): Promise<ApprovalEffectResultV1> {
      const [existing] = await db
        .select({ id: approvalEffectOutbox.id })
        .from(approvalEffectOutbox)
        .where(eq(approvalEffectOutbox.idempotencyKey, command.idempotencyKey))
        .limit(1)
      if (existing) {
        return {
          contractVersion: EXECUTION_CONTRACTS_VERSION,
          commandId: command.commandId,
          status: 'already_queued',
          outboxId: existing.id,
        }
      }
      const id = generateId()
      await db.insert(approvalEffectOutbox).values({
        id,
        idempotencyKey: command.idempotencyKey,
        event: command.event,
        approvalId: command.approvalId,
        payload: {
          workspaceId: command.workspaceId,
          taskIds: command.taskIds,
          action: command.action,
          actorId: command.actorId,
        },
      })
      return {
        contractVersion: EXECUTION_CONTRACTS_VERSION,
        commandId: command.commandId,
        status: 'queued',
        outboxId: id,
      }
    },
  }
}

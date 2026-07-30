import { z } from 'zod'
import { EXECUTION_CONTRACTS_VERSION } from './version'

export const approvalEffectCommandV1Schema = z
  .object({
    contractVersion: z.literal(EXECUTION_CONTRACTS_VERSION),
    commandId: z.string().min(1),
    idempotencyKey: z.string().min(1).max(500),
    event: z.enum(['approval.started', 'approval.decided']),
    approvalId: z.string().min(1),
    workspaceId: z.string().min(1).optional(),
    taskIds: z.array(z.string().min(1)).max(100).optional(),
    action: z.enum(['approve', 'reject', 'return', 'transfer', 'add_sign', 'comment']).optional(),
    actorId: z.string().min(1).optional(),
  })
  .strict()

export const approvalEffectResultV1Schema = z
  .object({
    contractVersion: z.literal(EXECUTION_CONTRACTS_VERSION),
    commandId: z.string(),
    status: z.enum(['queued', 'already_queued']),
    outboxId: z.string().min(1),
  })
  .strict()

export type ApprovalEffectCommandV1 = z.infer<typeof approvalEffectCommandV1Schema>
export type ApprovalEffectResultV1 = z.infer<typeof approvalEffectResultV1Schema>

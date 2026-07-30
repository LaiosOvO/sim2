import { z } from 'zod'
import { EXECUTION_CONTRACTS_VERSION } from './version'

export const approvalResumeCommandV1Schema = z
  .object({
    contractVersion: z.literal(EXECUTION_CONTRACTS_VERSION),
    commandId: z.string().min(1),
    approvalId: z.string().min(1),
    workflowId: z.string().min(1),
    executionId: z.string().min(1),
    contextId: z.string().min(1),
    decision: z.enum([
      'approved',
      'rejected',
      'returned',
      'withdrawn',
      'escalated',
      'cancelled',
      'expired',
    ]),
  })
  .strict()

export const approvalResumeResultV1Schema = z
  .object({
    contractVersion: z.literal(EXECUTION_CONTRACTS_VERSION),
    commandId: z.string(),
    status: z.enum(['resuming', 'queued']),
    resumeExecutionId: z.string().min(1),
  })
  .strict()

export type ApprovalResumeCommandV1 = z.infer<typeof approvalResumeCommandV1Schema>
export type ApprovalResumeResultV1 = z.infer<typeof approvalResumeResultV1Schema>

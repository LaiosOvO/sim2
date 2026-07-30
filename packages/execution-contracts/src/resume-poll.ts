import { z } from 'zod'
import { EXECUTION_CONTRACTS_VERSION } from './version'

export const resumePollCommandV1Schema = z.object({
  contractVersion: z.literal(EXECUTION_CONTRACTS_VERSION),
  commandId: z.string().min(1),
  requestedAt: z.iso.datetime(),
})

export const resumePollFailureV1Schema = z.object({
  executionId: z.string(),
  contextId: z.string(),
  error: z.string(),
})

export const resumePollResultV1Schema = z.object({
  contractVersion: z.literal(EXECUTION_CONTRACTS_VERSION),
  commandId: z.string(),
  status: z.enum(['completed', 'skipped']),
  claimedRows: z.number().int().nonnegative(),
  dispatched: z.number().int().nonnegative(),
  failures: z.array(resumePollFailureV1Schema),
  message: z.string().optional(),
})

export type ResumePollCommandV1 = z.output<typeof resumePollCommandV1Schema>
export type ResumePollResultV1 = z.output<typeof resumePollResultV1Schema>

export const resumeExecutionCommandV1Schema = z.object({
  contractVersion: z.literal(EXECUTION_CONTRACTS_VERSION),
  resumeEntryId: z.string().min(1),
  pausedExecutionId: z.string().min(1),
  workflowId: z.string().min(1),
  executionId: z.string().min(1),
  contextId: z.string().min(1),
  userId: z.string().min(1),
  workspaceId: z.string().min(1),
  snapshot: z.unknown(),
  input: z.unknown(),
})

export const resumeExecutionResultV1Schema = z.discriminatedUnion('ok', [
  z.object({
    contractVersion: z.literal(EXECUTION_CONTRACTS_VERSION),
    ok: z.literal(true),
    status: z.enum(['completed', 'paused']),
    output: z.unknown().optional(),
  }),
  z.object({
    contractVersion: z.literal(EXECUTION_CONTRACTS_VERSION),
    ok: z.literal(false),
    retryable: z.boolean(),
    error: z.string(),
  }),
])

export type ResumeExecutionCommandV1 = z.output<typeof resumeExecutionCommandV1Schema>
export type ResumeExecutionResultV1 = z.output<typeof resumeExecutionResultV1Schema>

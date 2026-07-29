import { z } from 'zod'
import { EXECUTION_CONTRACTS_VERSION } from './version'

export const debugSessionV1Schema = z.object({
  contractVersion: z.literal(EXECUTION_CONTRACTS_VERSION),
  sessionId: z.string().min(1),
  executionId: z.string().min(1),
  workflowId: z.string().min(1),
  draftHash: z.string().min(1),
  version: z.number().int().positive(),
  state: z.enum(['created', 'running', 'paused', 'completed', 'failed', 'cancelled', 'expired']),
  currentNodeId: z.string().min(1).nullable(),
  breakpoints: z.array(z.string().min(1)),
  expiresAt: z.iso.datetime(),
})

export const debugCommandV1Schema = z.object({
  contractVersion: z.literal(EXECUTION_CONTRACTS_VERSION),
  commandId: z.string().min(1),
  sessionId: z.string().min(1),
  expectedVersion: z.number().int().positive(),
  command: z.enum(['continue', 'step', 'cancel']),
})

export type DebugSessionV1 = z.infer<typeof debugSessionV1Schema>
export type DebugCommandV1 = z.infer<typeof debugCommandV1Schema>

import { z } from 'zod'
import { EXECUTION_CONTRACTS_VERSION } from './version'

const eventBase = z.object({
  contractVersion: z.literal(EXECUTION_CONTRACTS_VERSION),
  eventId: z.string().min(1),
  executionId: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  occurredAt: z.iso.datetime(),
})

export const executionEventV1Schema = z.discriminatedUnion('type', [
  eventBase.extend({
    type: z.literal('started'),
    attempt: z.number().int().positive().optional(),
  }),
  eventBase.extend({
    type: z.literal('retry-scheduled'),
    attempt: z.number().int().positive(),
    nextAttempt: z.number().int().positive(),
    reason: z.string().min(1),
  }),
  eventBase.extend({
    type: z.literal('node-progress'),
    nodeId: z.string().min(1),
    status: z.enum(['queued', 'running', 'completed', 'failed', 'skipped']),
  }),
  eventBase.extend({
    type: z.literal('completed'),
    output: z.unknown(),
  }),
  eventBase.extend({
    type: z.literal('failed'),
    errorCode: z.string().min(1),
    message: z.string().min(1),
    retryable: z.boolean(),
  }),
  eventBase.extend({
    type: z.literal('cancelled'),
    reason: z.string().min(1).optional(),
  }),
  eventBase.extend({
    type: z.literal('dead-lettered'),
    reason: z.string().min(1),
  }),
])

export type ExecutionEventV1 = z.infer<typeof executionEventV1Schema>

import { z } from 'zod'
import { EXECUTION_CONTRACTS_VERSION } from './version'

export const MAX_EXECUTION_OBJECT_BYTES = 64 * 1024 * 1024

const largeValueIdPattern = /^lv_[A-Za-z0-9_-]{12}$/

export const executionObjectReferenceV1Schema = z.object({
  __simLargeValueRef: z.literal(true),
  version: z.literal(1),
  id: z.string().regex(largeValueIdPattern),
  kind: z.enum(['array', 'object', 'string', 'json']),
  size: z.number().int().positive().max(MAX_EXECUTION_OBJECT_BYTES),
  key: z.string().min(1),
  executionId: z.string().min(1).optional(),
})

export const executionObjectReadCommandV1Schema = z
  .object({
    contractVersion: z.literal(EXECUTION_CONTRACTS_VERSION),
    requestId: z.string().min(1).max(256),
    workspaceId: z.string().min(1),
    workflowId: z.string().min(1),
    executionId: z.string().min(1),
    reference: executionObjectReferenceV1Schema,
  })
  .superRefine((command, context) => {
    const expectedKey =
      `execution/${command.workspaceId}/${command.workflowId}/${command.executionId}` +
      `/large-value-${command.reference.id}.json`
    if (command.reference.key !== expectedKey) {
      context.addIssue({
        code: 'custom',
        path: ['reference', 'key'],
        message: 'Execution object key does not match the authorized scope',
      })
    }
    if (
      command.reference.executionId !== undefined &&
      command.reference.executionId !== command.executionId
    ) {
      context.addIssue({
        code: 'custom',
        path: ['reference', 'executionId'],
        message: 'Execution object reference does not match the requested execution',
      })
    }
  })

const resultBase = {
  contractVersion: z.literal(EXECUTION_CONTRACTS_VERSION),
  requestId: z.string().min(1),
}

export const executionObjectReadResultV1Schema = z.discriminatedUnion('status', [
  z.object({
    ...resultBase,
    status: z.literal('found'),
    data: z.unknown(),
  }),
  z.object({
    ...resultBase,
    status: z.literal('missing'),
  }),
  z.object({
    ...resultBase,
    status: z.literal('unavailable'),
    error: z.string().min(1).max(1000),
  }),
])

export type ExecutionObjectReferenceV1 = z.output<typeof executionObjectReferenceV1Schema>
export type ExecutionObjectReadCommandV1 = z.output<typeof executionObjectReadCommandV1Schema>
export type ExecutionObjectReadResultV1 = z.output<typeof executionObjectReadResultV1Schema>

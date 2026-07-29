import { traceContextSchema } from '@sim/api-contracts/tracing'
import { z } from 'zod'
import { EXECUTION_CONTRACTS_VERSION } from './version'

export const executionJobV1Schema = z.object({
  contractVersion: z.literal(EXECUTION_CONTRACTS_VERSION),
  jobId: z.string().min(1),
  executionId: z.string().min(1),
  workspaceId: z.string().min(1),
  workflowId: z.string().min(1),
  kind: z.enum(['run', 'replay', 'debug']),
  requestedAt: z.iso.datetime(),
  trace: traceContextSchema,
  payload: z.record(z.string(), z.unknown()),
})

export type ExecutionJobV1 = z.infer<typeof executionJobV1Schema>

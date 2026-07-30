import { z } from 'zod'

export const jobStatusV1Schema = z.enum(['pending', 'processing', 'completed', 'failed'])

export const jobStatusParamsV1Schema = z.object({
  jobId: z.string().min(1, 'Invalid job ID'),
})

export const jobStatusResponseV1Schema = z.object({
  success: z.literal(true),
  taskId: z.string(),
  status: jobStatusV1Schema,
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  output: z.unknown().optional(),
  error: z.string().optional(),
})

export const workflowExecutionStatusParamsV1Schema = z.object({
  id: z.string().min(1, 'Invalid workflow ID'),
  executionId: z.string().min(1, 'Invalid execution ID'),
})

export const workflowExecutionStatusQueryV1Schema = z.object({
  includeOutput: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  selectedOutputs: z
    .string()
    .optional()
    .transform((value) =>
      value
        ? value
            .split(',')
            .map((selector) => selector.trim())
            .filter(Boolean)
        : []
    ),
})

export const workflowExecutionStatusV1Schema = z.enum([
  'pending',
  'running',
  'paused',
  'completed',
  'failed',
  'cancelled',
])

export const workflowExecutionPausedDetailV1Schema = z.object({
  pausedAt: z.iso.datetime(),
  resumeAt: z.iso.datetime().nullable(),
  pauseKind: z.enum(['time', 'human']).nullable(),
  blockedOnBlockId: z.string().nullable(),
  automaticResumeWaitingReason: z.string().nullable(),
  pausedExecutionId: z.string(),
  pausePointCount: z.number().int().nonnegative(),
  resumedCount: z.number().int().nonnegative(),
})

export const workflowExecutionStatusResponseV1Schema = z.object({
  executionId: z.string(),
  workflowId: z.string(),
  status: workflowExecutionStatusV1Schema,
  trigger: z.string(),
  level: z.string(),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
  totalDurationMs: z.number().int().nonnegative().nullable(),
  paused: workflowExecutionPausedDetailV1Schema.nullable(),
  cost: z.object({ total: z.number() }).nullable(),
  error: z.string().nullable(),
  finalOutput: z.unknown().nullable(),
  blockOutputs: z.record(z.string(), z.unknown()).nullable(),
})

export const resumePollFailureV1Schema = z.object({
  executionId: z.string(),
  contextId: z.string(),
  error: z.string(),
})

export const resumePollResponseV1Schema = z.object({
  success: z.boolean(),
  requestId: z.string(),
  claimedRows: z.number().int().nonnegative().optional(),
  dispatched: z.number().int().nonnegative().optional(),
  failures: z.array(resumePollFailureV1Schema).optional(),
  message: z.string().optional(),
  error: z.string().optional(),
})

export type JobStatusV1 = z.output<typeof jobStatusV1Schema>
export type JobStatusResponseV1 = z.output<typeof jobStatusResponseV1Schema>
export type WorkflowExecutionStatusQueryV1 = z.output<typeof workflowExecutionStatusQueryV1Schema>
export type WorkflowExecutionStatusResponseV1 = z.output<
  typeof workflowExecutionStatusResponseV1Schema
>
export type ResumePollResponseV1 = z.output<typeof resumePollResponseV1Schema>

export const executionControlRoutesV1 = {
  jobStatus: { inventoryId: 'API-0138', method: 'GET', path: '/api/jobs/[jobId]' },
  resumePoll: { inventoryId: 'API-0283', method: 'GET', path: '/api/resume/poll' },
  workflowExecutionStatus: {
    inventoryId: 'API-0993',
    method: 'GET',
    path: '/api/workflows/[id]/executions/[executionId]',
  },
} as const

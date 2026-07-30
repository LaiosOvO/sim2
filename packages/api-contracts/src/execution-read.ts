import { z } from 'zod'

export const resumeExecutionParamsV1Schema = z.object({
  workflowId: z.string().min(1),
  executionId: z.string().min(1),
})

export const workflowExecutionParamsV1Schema = z.object({
  id: z.string().min(1, 'Invalid workflow ID'),
  executionId: z.string().min(1, 'Invalid execution ID'),
})

export const workflowIdParamsV1Schema = z.object({
  id: z.string().min(1, 'Invalid workflow ID'),
})

export const pausedExecutionListQueryV1Schema = z.object({
  status: z.string().optional(),
})

export const resumeQueueEntryV1Schema = z
  .object({
    id: z.string(),
    pausedExecutionId: z.string(),
    parentExecutionId: z.string(),
    newExecutionId: z.string(),
    contextId: z.string(),
    resumeInput: z.json().nullable(),
    status: z.string(),
    queuedAt: z.iso.datetime().nullable(),
    claimedAt: z.iso.datetime().nullable(),
    completedAt: z.iso.datetime().nullable(),
    failureReason: z.string().nullable(),
  })
  .strict()

export const pausedExecutionResumeLinksV1Schema = z
  .object({
    apiUrl: z.string(),
    uiUrl: z.string(),
    contextId: z.string(),
    executionId: z.string(),
    workflowId: z.string(),
  })
  .strict()

export const pausedExecutionParallelScopeV1Schema = z
  .object({
    parallelId: z.string(),
    branchIndex: z.number().int().nonnegative(),
    branchTotal: z.number().int().nonnegative().optional(),
  })
  .strict()

export const pausedExecutionLoopScopeV1Schema = z
  .object({
    loopId: z.string(),
    iteration: z.number().int().nonnegative(),
  })
  .strict()

export const pausedExecutionPausePointV1Schema = z
  .object({
    contextId: z.string(),
    blockId: z.string(),
    response: z.json().optional(),
    registeredAt: z.string().optional(),
    resumeStatus: z.enum(['paused', 'resumed', 'failed', 'queued', 'resuming']),
    automaticResumeWaitingReason: z.string().optional(),
    snapshotReady: z.boolean(),
    parallelScope: pausedExecutionParallelScopeV1Schema.optional(),
    loopScope: pausedExecutionLoopScopeV1Schema.optional(),
    resumeLinks: pausedExecutionResumeLinksV1Schema.optional(),
    pauseKind: z.literal('human'),
    resumeAt: z.string().optional(),
    queuePosition: z.number().int().positive().nullable(),
    latestResumeEntry: resumeQueueEntryV1Schema.nullable(),
  })
  .strict()

export const pausedExecutionSummaryV1Schema = z
  .object({
    id: z.string(),
    workflowId: z.string(),
    executionId: z.string(),
    status: z.string(),
    totalPauseCount: z.number().int().nonnegative(),
    resumedCount: z.number().int().nonnegative(),
    pausedAt: z.iso.datetime().nullable(),
    updatedAt: z.iso.datetime().nullable(),
    expiresAt: z.iso.datetime().nullable(),
    metadata: z.record(z.string(), z.json()).nullable(),
    triggerIds: z.array(z.string()),
    pausePoints: z.array(pausedExecutionPausePointV1Schema),
  })
  .strict()

export const serializedPausedExecutionSnapshotV1Schema = z
  .object({
    snapshot: z.string(),
    triggerIds: z.array(z.string()),
  })
  .strict()

export const pausedExecutionDetailV1Schema = pausedExecutionSummaryV1Schema.extend({
  executionSnapshot: serializedPausedExecutionSnapshotV1Schema,
  queue: z.array(resumeQueueEntryV1Schema),
})

export const pausedExecutionListResponseV1Schema = z
  .object({
    pausedExecutions: z.array(pausedExecutionSummaryV1Schema),
  })
  .strict()

export const executionReadRouteV1Schema = z.object({
  inventoryId: z.enum(['API-0282', 'API-0996', 'API-0997']),
  method: z.literal('GET'),
  pathTemplate: z.string().startsWith('/api/'),
  authMode: z.literal('hybrid-all'),
})

export const executionReadRoutesV1 = [
  {
    inventoryId: 'API-0282',
    method: 'GET',
    pathTemplate: '/api/resume/[workflowId]/[executionId]',
    authMode: 'hybrid-all',
  },
  {
    inventoryId: 'API-0996',
    method: 'GET',
    pathTemplate: '/api/workflows/[id]/paused/[executionId]',
    authMode: 'hybrid-all',
  },
  {
    inventoryId: 'API-0997',
    method: 'GET',
    pathTemplate: '/api/workflows/[id]/paused',
    authMode: 'hybrid-all',
  },
] as const

export type ResumeExecutionParamsV1 = z.infer<typeof resumeExecutionParamsV1Schema>
export type WorkflowExecutionParamsV1 = z.infer<typeof workflowExecutionParamsV1Schema>
export type WorkflowIdParamsV1 = z.infer<typeof workflowIdParamsV1Schema>
export type PausedExecutionListQueryV1 = z.infer<typeof pausedExecutionListQueryV1Schema>
export type ResumeQueueEntryV1 = z.infer<typeof resumeQueueEntryV1Schema>
export type PausedExecutionResumeLinksV1 = z.infer<typeof pausedExecutionResumeLinksV1Schema>
export type PausedExecutionParallelScopeV1 = z.infer<typeof pausedExecutionParallelScopeV1Schema>
export type PausedExecutionLoopScopeV1 = z.infer<typeof pausedExecutionLoopScopeV1Schema>
export type PausedExecutionPausePointV1 = z.infer<typeof pausedExecutionPausePointV1Schema>
export type PausedExecutionSummaryV1 = z.infer<typeof pausedExecutionSummaryV1Schema>
export type SerializedPausedExecutionSnapshotV1 = z.infer<
  typeof serializedPausedExecutionSnapshotV1Schema
>
export type PausedExecutionDetailV1 = z.infer<typeof pausedExecutionDetailV1Schema>
export type PausedExecutionListResponseV1 = z.infer<typeof pausedExecutionListResponseV1Schema>
export type ExecutionReadRouteV1 = z.infer<typeof executionReadRouteV1Schema>

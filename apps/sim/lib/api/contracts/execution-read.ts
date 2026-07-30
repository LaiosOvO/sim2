import {
  type PausedExecutionDetailV1,
  type PausedExecutionPausePointV1,
  type PausedExecutionSummaryV1,
  pausedExecutionDetailV1Schema,
  type ResumeQueueEntryV1,
  resumeExecutionParamsV1Schema,
} from '@sim/api-contracts/execution-read'
import { z } from 'zod'
import { defineRouteContract } from '@/lib/api/contracts/types'

export const getPausedExecutionDetailContract = defineRouteContract({
  method: 'GET',
  path: '/api/resume/[workflowId]/[executionId]',
  params: resumeExecutionParamsV1Schema,
  response: {
    mode: 'json',
    schema: pausedExecutionDetailV1Schema,
  },
})

const pauseContextParamsSchema = resumeExecutionParamsV1Schema.extend({
  contextId: z.string().min(1),
})

/**
 * API-0283 is not native yet. This deliberately narrow compatibility contract
 * keeps its user-defined response payload opaque without importing the
 * monolithic workflow contract into the resume client.
 */
export const getPauseContextDetailContract = defineRouteContract({
  method: 'GET',
  path: '/api/resume/[workflowId]/[executionId]/[contextId]',
  params: pauseContextParamsSchema,
  response: {
    mode: 'json',
    schema: z
      .object({
        execution: z.unknown(),
        pausePoint: z.record(z.string(), z.unknown()),
        queue: z.array(z.record(z.string(), z.unknown())),
        activeResumeEntry: z.record(z.string(), z.unknown()).nullable().optional(),
      })
      .passthrough(),
  },
})

export type ResumeQueueEntrySummary = ResumeQueueEntryV1
export type PausePointWithQueue = PausedExecutionPausePointV1 & {
  triggerBlockId?: string
}
export type PausedExecutionSummary = Omit<PausedExecutionSummaryV1, 'pausePoints'> & {
  pausePoints: PausePointWithQueue[]
}
export type PausedExecutionDetail = Omit<PausedExecutionDetailV1, 'pausePoints' | 'queue'> & {
  pausePoints: PausePointWithQueue[]
  queue: ResumeQueueEntrySummary[]
}
export interface PauseContextDetail {
  execution: PausedExecutionSummary
  pausePoint: PausePointWithQueue
  queue: ResumeQueueEntrySummary[]
  activeResumeEntry?: ResumeQueueEntrySummary | null
}

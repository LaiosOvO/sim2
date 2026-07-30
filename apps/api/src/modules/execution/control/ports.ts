import type { JobStatusV1 } from '@sim/api-contracts/execution-control'
import type { ExecutionObjectReferenceV1 } from '@sim/execution-contracts/execution-object-read'
import type { ResumePollResultV1 } from '@sim/execution-contracts/resume-poll'

export interface JobStatusRecord {
  id: string
  status: JobStatusV1
  metadata?: Record<string, unknown> | null
  output?: unknown
  error?: string
}

export interface JobStatusReader {
  read(jobId: string): Promise<JobStatusRecord | null>
}

export interface ExecutionStatusRecord {
  executionId: string
  workflowId: string | null
  workspaceId: string
  status: string
  level: string
  trigger: string
  startedAt: Date
  endedAt: Date | null
  totalDurationMs: number | null
  executionData: Record<string, unknown>
  costTotal: string | null
}

export interface PausedExecutionStatusRecord {
  id: string
  status: string
  pausePoints: unknown
  metadata: unknown
  resumedCount: number
  pausedAt: Date
  nextResumeAt: Date | null
}

export interface ExecutionStatusView {
  execution: ExecutionStatusRecord
  paused: PausedExecutionStatusRecord | null
}

export interface ExecutionStatusReader {
  read(workflowId: string, executionId: string): Promise<ExecutionStatusView | null>
}

export interface ExecutionPayloadMaterializer {
  materialize(record: ExecutionStatusRecord): Promise<Record<string, unknown>>
}

export interface ExecutionObjectStore {
  readJson(input: {
    reference: ExecutionObjectReferenceV1
    workspaceId: string
    workflowId: string
    executionId: string
  }): Promise<unknown | null>
}

export class ExecutionPayloadUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ExecutionPayloadUnavailableError'
  }
}

export interface ResumePollCommandPort {
  run(commandId: string): Promise<ResumePollResultV1>
}

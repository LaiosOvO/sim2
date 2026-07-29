import type { AuthenticatedRequestContext } from '@sim/api-contracts/auth'
import {
  type WorkspaceExecutionMetricsQueryV1,
  type WorkspaceExecutionMetricsResponseV1,
  workspaceExecutionMetricsQueryV1Schema,
  workspaceExecutionMetricsResponseV1Schema,
} from '@sim/api-contracts/workspaces'
import type { RequestAccessResolver } from '@sim/auth/authorization'
import type {
  WorkspaceExecutionMetricsLevel,
  WorkspaceExecutionMetricsReadRepository,
  WorkspaceExecutionMetricsSample,
} from '@/modules/workspaces/ports/workspace-execution-metrics-read-repository'

export type GetWorkspaceExecutionMetricsResult =
  | { ok: true; value: WorkspaceExecutionMetricsResponseV1 }
  | { ok: false; reason: 'workspace-access-denied' | 'invalid-time-range' }

export interface GetWorkspaceExecutionMetricsUseCase {
  execute(
    context: AuthenticatedRequestContext,
    workspaceId: string,
    rawQuery: unknown
  ): Promise<GetWorkspaceExecutionMetricsResult>
}

export interface GetWorkspaceExecutionMetricsDependencies {
  access: RequestAccessResolver
  repository: WorkspaceExecutionMetricsReadRepository
  now?: () => Date
}

interface Bucket {
  timestamp: string
  totalExecutions: number
  successfulExecutions: number
  durations: number[]
}

function csv(value: string | undefined): string[] | undefined {
  return value ? value.split(',').filter(Boolean) : undefined
}

function levels(value: string | undefined): WorkspaceExecutionMetricsLevel[] | undefined {
  if (!value || value === 'all') return undefined
  const accepted = new Set<WorkspaceExecutionMetricsLevel>(['error', 'info', 'running', 'pending'])
  const selected = value
    .split(',')
    .filter((candidate): candidate is WorkspaceExecutionMetricsLevel =>
      accepted.has(candidate as WorkspaceExecutionMetricsLevel)
    )
  return selected.length > 0 ? selected : undefined
}

function percentile(values: readonly number[], percentileValue: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.min(
    sorted.length - 1,
    Math.floor((percentileValue / 100) * (sorted.length - 1))
  )
  return sorted[index] ?? 0
}

function emptyAllTimeResponse(
  workflows: readonly { id: string; name: string }[],
  now: Date
): WorkspaceExecutionMetricsResponseV1 {
  return workspaceExecutionMetricsResponseV1Schema.parse({
    workflows: workflows.map((workflow) => ({
      workflowId: workflow.id,
      workflowName: workflow.name,
      segments: [],
    })),
    startTime: now.toISOString(),
    endTime: now.toISOString(),
    segmentMs: 0,
  })
}

function projectBuckets(
  workflows: readonly { id: string; name: string }[],
  samples: readonly WorkspaceExecutionMetricsSample[],
  start: Date,
  segments: number,
  segmentMs: number
): WorkspaceExecutionMetricsResponseV1['workflows'] {
  const workflowBuckets = new Map<string, Bucket[]>()
  for (const workflow of workflows) {
    workflowBuckets.set(
      workflow.id,
      Array.from({ length: segments }, (_, index) => ({
        timestamp: new Date(start.getTime() + index * segmentMs).toISOString(),
        totalExecutions: 0,
        successfulExecutions: 0,
        durations: [],
      }))
    )
  }

  for (const sample of samples) {
    if (!sample.workflowId) continue
    const index = Math.min(
      segments - 1,
      Math.max(0, Math.floor((sample.startedAt.getTime() - start.getTime()) / segmentMs))
    )
    const buckets = workflowBuckets.get(sample.workflowId)
    if (!buckets) continue
    const bucket = buckets[index]
    if (!bucket) {
      throw new Error('Execution metric bucket index is outside the configured segment range')
    }
    bucket.totalExecutions += 1
    if (sample.level.toLowerCase() !== 'error') bucket.successfulExecutions += 1
    if (typeof sample.totalDurationMs === 'number') {
      bucket.durations.push(sample.totalDurationMs)
    }
  }

  return workflows.map((workflow) => ({
    workflowId: workflow.id,
    workflowName: workflow.name,
    segments: (workflowBuckets.get(workflow.id) ?? []).map((bucket) => ({
      timestamp: bucket.timestamp,
      totalExecutions: bucket.totalExecutions,
      successfulExecutions: bucket.successfulExecutions,
      avgDurationMs:
        bucket.durations.length > 0
          ? Math.round(
              bucket.durations.reduce((sum, duration) => sum + duration, 0) /
                bucket.durations.length
            )
          : 0,
      p50Ms: percentile(bucket.durations, 50),
      p90Ms: percentile(bucket.durations, 90),
      p99Ms: percentile(bucket.durations, 99),
    })),
  }))
}

function parseQuery(rawQuery: unknown): WorkspaceExecutionMetricsQueryV1 {
  return workspaceExecutionMetricsQueryV1Schema.parse(rawQuery)
}

export function createGetWorkspaceExecutionMetricsUseCase(
  dependencies: GetWorkspaceExecutionMetricsDependencies
): GetWorkspaceExecutionMetricsUseCase {
  const now = dependencies.now ?? (() => new Date())

  return {
    async execute(context, workspaceId, rawQuery) {
      const query = parseQuery(rawQuery)
      const currentTime = now()
      let end = query.endTime ? new Date(query.endTime) : currentTime
      let start = query.startTime
        ? new Date(query.startTime)
        : new Date(end.getTime() - 24 * 60 * 60 * 1000)

      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return { ok: false, reason: 'invalid-time-range' }
      }
      if (context.actor.type !== 'user') {
        return { ok: false, reason: 'workspace-access-denied' }
      }
      const permission = await dependencies.access.workspacePermission(
        context.actor.id,
        workspaceId
      )
      if (!permission) return { ok: false, reason: 'workspace-access-denied' }

      const workflowIds = csv(query.workflowIds)
      const folderIds = csv(query.folderIds)
      const workflows = await dependencies.repository.listWorkflows({
        workspaceId,
        ...(workflowIds !== undefined ? { workflowIds } : {}),
        ...(folderIds !== undefined ? { folderIds } : {}),
      })

      if (workflows.length === 0) {
        return {
          ok: true,
          value: workspaceExecutionMetricsResponseV1Schema.parse({
            workflows: [],
            startTime: start.toISOString(),
            endTime: end.toISOString(),
            segmentMs: 0,
          }),
        }
      }

      const triggerFilters = csv(query.triggers)
      const levelFilters = levels(query.level)
      const logFilter = {
        workflowIds: workflows.map((workflow) => workflow.id),
        ...(triggerFilters !== undefined ? { triggers: triggerFilters } : {}),
        ...(levelFilters !== undefined ? { levels: levelFilters } : {}),
      }

      if (query.allTime === 'true') {
        const bounds = await dependencies.repository.readBounds(logFilter)
        if (!bounds.minDate || !bounds.maxDate) {
          return { ok: true, value: emptyAllTimeResponse(workflows, currentTime) }
        }
        start = new Date(bounds.minDate)
        end = new Date(Math.max(new Date(bounds.maxDate).getTime(), currentTime.getTime()))
      }

      if (start >= end) return { ok: false, reason: 'invalid-time-range' }

      const totalMs = Math.max(1, end.getTime() - start.getTime())
      const segmentMs = Math.max(1, Math.floor(totalMs / Math.max(1, query.segments)))
      const samples = await dependencies.repository.listSamples({
        ...logFilter,
        start,
        end,
      })

      return {
        ok: true,
        value: workspaceExecutionMetricsResponseV1Schema.parse({
          workflows: projectBuckets(workflows, samples, start, query.segments, segmentMs),
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          segmentMs,
        }),
      }
    },
  }
}

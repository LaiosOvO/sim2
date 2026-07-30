import type {
  PausedExecutionDetailV1,
  PausedExecutionLoopScopeV1,
  PausedExecutionParallelScopeV1,
  PausedExecutionPausePointV1,
  PausedExecutionResumeLinksV1,
  PausedExecutionSummaryV1,
  ResumeQueueEntryV1,
  SerializedPausedExecutionSnapshotV1,
} from '@sim/api-contracts'
import {
  pausedExecutionDetailV1Schema,
  pausedExecutionLoopScopeV1Schema,
  pausedExecutionParallelScopeV1Schema,
  pausedExecutionPausePointV1Schema,
  pausedExecutionResumeLinksV1Schema,
  pausedExecutionSummaryV1Schema,
  resumeQueueEntryV1Schema,
  serializedPausedExecutionSnapshotV1Schema,
} from '@sim/api-contracts'

export interface PausedExecutionProjectionRow {
  id: string
  workflowId: string
  executionId: string
  status: string
  pausePoints: unknown
  metadata: unknown
  pausedAt: Date | null
  updatedAt: Date | null
  expiresAt: Date | null
  executionSnapshot?: unknown
  triggerIds?: unknown
}

export interface ResumeQueueProjectionRow {
  id: string
  pausedExecutionId: string
  parentExecutionId: string
  newExecutionId: string
  contextId: string
  resumeInput: unknown
  status: string
  queuedAt: Date | null
  claimedAt: Date | null
  completedAt: Date | null
  failureReason: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null
}

function normalizeBlockId(value: unknown, contextId: unknown): string {
  const candidate =
    typeof value === 'string' ? value : typeof contextId === 'string' ? contextId : ''
  const normalized = candidate.replace(/_loop\d+/g, '')
  return normalized || candidate
}

function normalizeResumeLinks(value: unknown): PausedExecutionResumeLinksV1 | undefined {
  if (!isRecord(value)) return undefined
  const projected = {
    apiUrl: value.apiUrl,
    uiUrl: typeof value.uiUrl === 'string' ? value.uiUrl.split('?')[0] : value.uiUrl,
    contextId: value.contextId,
    executionId: value.executionId,
    workflowId: value.workflowId,
  }
  const parsed = pausedExecutionResumeLinksV1Schema.safeParse(projected)
  return parsed.success ? parsed.data : undefined
}

function normalizeParallelScope(value: unknown): PausedExecutionParallelScopeV1 | undefined {
  if (!isRecord(value)) return undefined
  const parsed = pausedExecutionParallelScopeV1Schema.safeParse({
    parallelId: value.parallelId,
    branchIndex: value.branchIndex,
    branchTotal: value.branchTotal,
  })
  return parsed.success ? parsed.data : undefined
}

function normalizeLoopScope(value: unknown): PausedExecutionLoopScopeV1 | undefined {
  if (!isRecord(value)) return undefined
  const parsed = pausedExecutionLoopScopeV1Schema.safeParse({
    loopId: value.loopId,
    iteration: value.iteration,
  })
  return parsed.success ? parsed.data : undefined
}

function normalizeExecutionSnapshot(value: unknown): SerializedPausedExecutionSnapshotV1 {
  if (!isRecord(value)) {
    return serializedPausedExecutionSnapshotV1Schema.parse(value)
  }
  return serializedPausedExecutionSnapshotV1Schema.parse({
    snapshot: value.snapshot,
    triggerIds: value.triggerIds,
  })
}

function normalizeQueueEntry(row: ResumeQueueProjectionRow): ResumeQueueEntryV1 {
  return resumeQueueEntryV1Schema.parse({
    id: row.id,
    pausedExecutionId: row.pausedExecutionId,
    parentExecutionId: row.parentExecutionId,
    newExecutionId: row.newExecutionId,
    contextId: row.contextId,
    resumeInput: row.resumeInput ?? null,
    status: row.status,
    queuedAt: iso(row.queuedAt),
    claimedAt: iso(row.claimedAt),
    completedAt: iso(row.completedAt),
    failureReason: row.failureReason ?? null,
  })
}

function queuePositions(entries: readonly ResumeQueueEntryV1[]): Map<string, number | null> {
  const pending = entries
    .filter((entry) => entry.status === 'pending')
    .sort((left, right) => {
      const leftTime = left.queuedAt ? Date.parse(left.queuedAt) : 0
      const rightTime = right.queuedAt ? Date.parse(right.queuedAt) : 0
      return leftTime - rightTime
    })
  const positions = new Map<string, number | null>()
  pending.forEach((entry, index) => {
    if (!positions.has(entry.contextId)) positions.set(entry.contextId, index + 1)
  })
  return positions
}

function latestEntries(entries: readonly ResumeQueueEntryV1[]): Map<string, ResumeQueueEntryV1> {
  const latest = new Map<string, ResumeQueueEntryV1>()
  for (const entry of entries) {
    const current = latest.get(entry.contextId)
    const currentTime = current?.queuedAt ? Date.parse(current.queuedAt) : 0
    const entryTime = entry.queuedAt ? Date.parse(entry.queuedAt) : 0
    if (!current || entryTime >= currentTime) latest.set(entry.contextId, entry)
  }
  return latest
}

function rawPausePoints(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(isRecord)
  if (!isRecord(value)) return []
  return Object.values(value).filter(isRecord)
}

function normalizePausePoints(
  value: unknown,
  entries: readonly ResumeQueueEntryV1[]
): PausedExecutionPausePointV1[] {
  const positions = queuePositions(entries)
  const latest = latestEntries(entries)
  return rawPausePoints(value)
    .filter((point) => point.pauseKind !== 'time')
    .map((point) => {
      const contextId = typeof point.contextId === 'string' ? point.contextId : ''
      return pausedExecutionPausePointV1Schema.parse({
        contextId: point.contextId,
        blockId: normalizeBlockId(point.blockId, point.contextId),
        response: point.response,
        registeredAt: point.registeredAt,
        resumeStatus: point.resumeStatus || 'paused',
        automaticResumeWaitingReason:
          typeof point.automaticResumeWaitingReason === 'string'
            ? point.automaticResumeWaitingReason
            : undefined,
        snapshotReady: Boolean(point.snapshotReady),
        parallelScope: normalizeParallelScope(point.parallelScope),
        loopScope: normalizeLoopScope(point.loopScope),
        resumeLinks: normalizeResumeLinks(point.resumeLinks),
        pauseKind: point.pauseKind ?? 'human',
        resumeAt: point.resumeAt,
        queuePosition: positions.get(contextId) ?? null,
        latestResumeEntry: latest.get(contextId) ?? null,
      })
    })
}

function readTriggerIds(row: PausedExecutionProjectionRow): string[] {
  const snapshotIds = isRecord(row.executionSnapshot) ? row.executionSnapshot.triggerIds : undefined
  const candidate = row.triggerIds ?? snapshotIds
  return Array.isArray(candidate)
    ? candidate.filter((value): value is string => typeof value === 'string')
    : []
}

function projectSummary(
  row: PausedExecutionProjectionRow,
  entries: readonly ResumeQueueEntryV1[]
): PausedExecutionSummaryV1 {
  const pausePoints = normalizePausePoints(row.pausePoints, entries)
  return pausedExecutionSummaryV1Schema.parse({
    id: row.id,
    workflowId: row.workflowId,
    executionId: row.executionId,
    status: row.status,
    totalPauseCount: pausePoints.length,
    resumedCount: pausePoints.filter((point) => point.resumeStatus === 'resumed').length,
    pausedAt: iso(row.pausedAt),
    updatedAt: iso(row.updatedAt),
    expiresAt: iso(row.expiresAt),
    metadata: isRecord(row.metadata) ? row.metadata : null,
    triggerIds: readTriggerIds(row),
    pausePoints,
  })
}

export function projectPausedExecutionSummary(
  row: PausedExecutionProjectionRow
): PausedExecutionSummaryV1 | null {
  const summary = projectSummary(row, [])
  return summary.pausePoints.length > 0 ? summary : null
}

export function projectPausedExecutionDetail(
  row: PausedExecutionProjectionRow,
  queueRows: readonly ResumeQueueProjectionRow[]
): PausedExecutionDetailV1 | null {
  const queue = queueRows.map(normalizeQueueEntry)
  const summary = projectSummary(row, queue)
  if (summary.pausePoints.length === 0) return null
  return pausedExecutionDetailV1Schema.parse({
    ...summary,
    executionSnapshot: normalizeExecutionSnapshot(row.executionSnapshot),
    queue,
  })
}

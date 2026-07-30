import { randomUUID } from 'node:crypto'
import { db } from '@sim/db'
import { pausedExecutions, resumeQueue } from '@sim/db/schema'
import { EXECUTION_CONTRACTS_VERSION } from '@sim/execution-contracts'
import type {
  ResumeExecutionCommandV1,
  ResumePollCommandV1,
  ResumePollResultV1,
} from '@sim/execution-contracts/resume-poll'
import { and, asc, eq, inArray, isNotNull, lte, sql } from 'drizzle-orm'
import type { ResumeExecutionRunner } from '@/jobs/resume/resume-execution-runner'
import type { ResumePoller } from '@/jobs/resume/types'

const maximumPausedSnapshotBytes = 16 * 1024 * 1024

interface PausePoint {
  contextId?: string
  pauseKind?: string
  resumeAt?: string
  resumeStatus?: string
  snapshotReady?: boolean
  automaticResumeWaitingReason?: string
  response?: unknown
}

interface ResumeMetadata {
  executorUserId: string
  workspaceId: string
}

interface ClaimedResume {
  entryId: string
  pausedExecutionId: string
  workflowId: string
  executionId: string
  contextId: string
  userId: string
  workspaceId: string
  snapshot: unknown
  input: unknown
}

interface ResumeAdmission {
  claim?: ClaimedResume
  failure?: ResumePollResultV1['failures'][number]
}

interface ResumeAdmissionBatch {
  candidateCount: number
  claims: ClaimedResume[]
  failures: ResumePollResultV1['failures']
}

export interface DrizzleResumePollerOptions {
  runner: ResumeExecutionRunner
  now?: () => Date
  retryDelayMs?: number
  staleClaimMs?: number
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function pausePointRecord(value: unknown): Record<string, PausePoint> {
  const source = record(value)
  if (source) return source as Record<string, PausePoint>
  if (!Array.isArray(value)) return {}
  return Object.fromEntries(
    value
      .filter((point): point is PausePoint => Boolean(point && typeof point === 'object'))
      .map((point, index) => [point.contextId ?? String(index), point])
  )
}

function parseResumeMetadata(metadata: unknown, snapshot: unknown): ResumeMetadata | null {
  const current = record(metadata)
  if (
    current &&
    typeof current.executorUserId === 'string' &&
    current.executorUserId &&
    typeof current.workspaceId === 'string' &&
    current.workspaceId
  ) {
    return {
      executorUserId: current.executorUserId,
      workspaceId: current.workspaceId,
    }
  }

  const serialized = record(snapshot)
  if (!serialized || typeof serialized.snapshot !== 'string') return null
  if (Buffer.byteLength(serialized.snapshot, 'utf8') > maximumPausedSnapshotBytes) return null
  try {
    const snapshotValue = record(JSON.parse(serialized.snapshot))
    const snapshotMetadata = record(snapshotValue?.metadata)
    const billing = record(snapshotMetadata?.billingAttribution)
    const workspaceId =
      typeof snapshotMetadata?.workspaceId === 'string'
        ? snapshotMetadata.workspaceId
        : typeof billing?.workspaceId === 'string'
          ? billing.workspaceId
          : undefined
    const executorUserId =
      typeof current?.executorUserId === 'string'
        ? current.executorUserId
        : typeof snapshotMetadata?.userId === 'string'
          ? snapshotMetadata.userId
          : typeof billing?.actorUserId === 'string'
            ? billing.actorUserId
            : undefined
    return workspaceId && executorUserId ? { workspaceId, executorUserId } : null
  } catch {
    return null
  }
}

function dueTimePoint(points: Record<string, PausePoint>, now: Date): PausePoint | null {
  return (
    Object.values(points)
      .filter((point) => {
        if (
          point.pauseKind !== 'time' ||
          point.resumeStatus !== 'paused' ||
          !point.snapshotReady ||
          !point.contextId ||
          !point.resumeAt
        ) {
          return false
        }
        const resumeAt = new Date(point.resumeAt)
        return !Number.isNaN(resumeAt.getTime()) && resumeAt <= now
      })
      .sort((left, right) => String(left.resumeAt).localeCompare(String(right.resumeAt)))[0] ?? null
  )
}

function nextResumeAt(points: Record<string, PausePoint>, after: Date): Date | null {
  const values = Object.values(points)
    .filter(
      (point) =>
        point.pauseKind === 'time' &&
        point.resumeStatus === 'paused' &&
        point.snapshotReady &&
        point.resumeAt
    )
    .map((point) => new Date(point.resumeAt!))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((left, right) => left.getTime() - right.getTime())
  const earliest = values[0]
  if (!earliest) return null
  return earliest <= after ? after : earliest
}

function allResumed(points: Record<string, PausePoint>): boolean {
  return Object.values(points).every(
    (point) => !['paused', 'queued', 'resuming'].includes(point.resumeStatus ?? 'paused')
  )
}

function waitingMetadata(
  metadata: unknown,
  contextId: string,
  reason: string,
  retryCount: number,
  now: Date,
  retryable: boolean
): Record<string, unknown> {
  return {
    ...(record(metadata) ?? {}),
    automaticResumeWaiting: {
      contextId,
      reason: reason.slice(0, 1000),
      recordedAt: now.toISOString(),
      state: retryable ? 'waiting' : 'intervention_required',
      retryCount,
    },
  }
}

async function admitDueResume(now: Date): Promise<ResumeAdmissionBatch> {
  const candidates = await db
    .select({ id: pausedExecutions.id })
    .from(pausedExecutions)
    .where(
      and(
        inArray(pausedExecutions.status, ['paused', 'partially_resumed']),
        isNotNull(pausedExecutions.nextResumeAt),
        lte(pausedExecutions.nextResumeAt, now)
      )
    )
    .orderBy(asc(pausedExecutions.nextResumeAt))
    .limit(200)

  const claims: ClaimedResume[] = []
  const failures: ResumePollResultV1['failures'] = []
  for (const candidate of candidates) {
    const admitted = await db.transaction(async (tx): Promise<ResumeAdmission | null> => {
      const row = await tx
        .select({
          id: pausedExecutions.id,
          workflowId: pausedExecutions.workflowId,
          executionId: pausedExecutions.executionId,
          pausePoints: pausedExecutions.pausePoints,
          metadata: pausedExecutions.metadata,
          resumedCount: pausedExecutions.resumedCount,
          automaticResumeRetryCount: pausedExecutions.automaticResumeRetryCount,
          status: pausedExecutions.status,
          nextResumeAt: pausedExecutions.nextResumeAt,
          snapshotBytes: sql<number>`octet_length(${pausedExecutions.executionSnapshot}::text)`,
        })
        .from(pausedExecutions)
        .where(
          and(
            eq(pausedExecutions.id, candidate.id),
            inArray(pausedExecutions.status, ['paused', 'partially_resumed']),
            isNotNull(pausedExecutions.nextResumeAt),
            lte(pausedExecutions.nextResumeAt, now)
          )
        )
        .for('update')
        .limit(1)
        .then((rows) => rows[0])
      if (!row) return null

      const points = pausePointRecord(row.pausePoints)
      const point = dueTimePoint(points, now)
      if (!point?.contextId) {
        await tx
          .update(pausedExecutions)
          .set({ nextResumeAt: nextResumeAt(points, now), updatedAt: now })
          .where(eq(pausedExecutions.id, row.id))
        return null
      }

      const snapshotBytes = Number(row.snapshotBytes)
      if (
        !Number.isFinite(snapshotBytes) ||
        snapshotBytes < 0 ||
        snapshotBytes > maximumPausedSnapshotBytes
      ) {
        const retryCount = row.automaticResumeRetryCount + 1
        point.automaticResumeWaitingReason =
          snapshotBytes > maximumPausedSnapshotBytes
            ? 'Paused execution snapshot exceeds the 16 MiB automatic-resume safety limit'
            : 'Paused execution snapshot size is unavailable'
        await tx
          .update(pausedExecutions)
          .set({
            pausePoints: points,
            metadata: waitingMetadata(
              row.metadata,
              point.contextId,
              point.automaticResumeWaitingReason,
              retryCount,
              now,
              false
            ),
            automaticResumeRetryCount: retryCount,
            nextResumeAt: null,
            updatedAt: now,
          })
          .where(eq(pausedExecutions.id, row.id))
        return {
          failure: {
            executionId: row.executionId,
            contextId: point.contextId,
            error: point.automaticResumeWaitingReason,
          },
        }
      }

      const executionSnapshot = await tx
        .select({ value: pausedExecutions.executionSnapshot })
        .from(pausedExecutions)
        .where(eq(pausedExecutions.id, row.id))
        .limit(1)
        .then((rows) => rows[0]?.value)
      if (!executionSnapshot) return null

      const resumeMetadata = parseResumeMetadata(row.metadata, executionSnapshot)
      if (!resumeMetadata) {
        const retryCount = row.automaticResumeRetryCount + 1
        point.automaticResumeWaitingReason = 'Paused execution resume metadata is unavailable'
        await tx
          .update(pausedExecutions)
          .set({
            pausePoints: points,
            metadata: waitingMetadata(
              row.metadata,
              point.contextId,
              point.automaticResumeWaitingReason,
              retryCount,
              now,
              false
            ),
            automaticResumeRetryCount: retryCount,
            nextResumeAt: null,
            updatedAt: now,
          })
          .where(eq(pausedExecutions.id, row.id))
        return {
          failure: {
            executionId: row.executionId,
            contextId: point.contextId,
            error: point.automaticResumeWaitingReason,
          },
        }
      }

      const existing = await tx
        .select()
        .from(resumeQueue)
        .where(
          and(
            eq(resumeQueue.pausedExecutionId, row.id),
            eq(resumeQueue.contextId, point.contextId),
            inArray(resumeQueue.status, ['pending', 'claimed'])
          )
        )
        .for('update')
        .limit(1)
        .then((rows) => rows[0])

      const entryId = existing?.id ?? `resume_${randomUUID()}`
      if (existing) {
        await tx
          .update(resumeQueue)
          .set({
            status: 'claimed',
            claimedAt: now,
            newExecutionId: row.executionId,
            failureReason: null,
          })
          .where(eq(resumeQueue.id, existing.id))
      } else {
        await tx.insert(resumeQueue).values({
          id: entryId,
          pausedExecutionId: row.id,
          parentExecutionId: row.executionId,
          newExecutionId: row.executionId,
          contextId: point.contextId,
          resumeInput: {},
          status: 'claimed',
          queuedAt: now,
          claimedAt: now,
        })
      }

      point.resumeStatus = 'resuming'
      point.automaticResumeWaitingReason = undefined
      const { automaticResumeWaiting: _waiting, ...metadata } = record(row.metadata) ?? {}
      await tx
        .update(pausedExecutions)
        .set({
          pausePoints: points,
          metadata,
          nextResumeAt: null,
          updatedAt: now,
        })
        .where(eq(pausedExecutions.id, row.id))

      return {
        claim: {
          entryId,
          pausedExecutionId: row.id,
          workflowId: row.workflowId,
          executionId: row.executionId,
          contextId: point.contextId,
          userId: resumeMetadata.executorUserId,
          workspaceId: resumeMetadata.workspaceId,
          snapshot: executionSnapshot,
          input: existing?.resumeInput ?? {},
        },
      }
    })
    if (admitted?.claim) claims.push(admitted.claim)
    if (admitted?.failure) failures.push(admitted.failure)
  }
  return { candidateCount: candidates.length, claims, failures }
}

async function recoverStaleClaims(now: Date, staleClaimMs: number): Promise<ClaimedResume[]> {
  const before = new Date(now.getTime() - staleClaimMs)
  const candidates = await db
    .select({ entryId: resumeQueue.id })
    .from(resumeQueue)
    .innerJoin(pausedExecutions, eq(pausedExecutions.id, resumeQueue.pausedExecutionId))
    .where(
      and(
        eq(resumeQueue.status, 'claimed'),
        lte(resumeQueue.claimedAt, before),
        lte(
          sql<number>`octet_length(${pausedExecutions.executionSnapshot}::text)`,
          maximumPausedSnapshotBytes
        )
      )
    )
    .limit(200)
  const claims: ClaimedResume[] = []
  for (const candidate of candidates) {
    const claim = await db.transaction(async (tx): Promise<ClaimedResume | null> => {
      const entry = await tx
        .select({
          entryId: resumeQueue.id,
          pausedExecutionId: pausedExecutions.id,
          workflowId: pausedExecutions.workflowId,
          executionId: pausedExecutions.executionId,
          contextId: resumeQueue.contextId,
          input: resumeQueue.resumeInput,
          metadata: pausedExecutions.metadata,
          snapshot: pausedExecutions.executionSnapshot,
        })
        .from(resumeQueue)
        .innerJoin(pausedExecutions, eq(pausedExecutions.id, resumeQueue.pausedExecutionId))
        .where(
          and(
            eq(resumeQueue.id, candidate.entryId),
            eq(resumeQueue.status, 'claimed'),
            lte(resumeQueue.claimedAt, before),
            lte(
              sql<number>`octet_length(${pausedExecutions.executionSnapshot}::text)`,
              maximumPausedSnapshotBytes
            )
          )
        )
        .for('update')
        .limit(1)
        .then((rows) => rows[0])
      if (!entry) return null
      const metadata = parseResumeMetadata(entry.metadata, entry.snapshot)
      if (!metadata) return null
      await tx.update(resumeQueue).set({ claimedAt: now }).where(eq(resumeQueue.id, entry.entryId))
      return {
        entryId: entry.entryId,
        pausedExecutionId: entry.pausedExecutionId,
        workflowId: entry.workflowId,
        executionId: entry.executionId,
        contextId: entry.contextId,
        userId: metadata.executorUserId,
        workspaceId: metadata.workspaceId,
        snapshot: entry.snapshot,
        input: entry.input,
      }
    })
    if (claim) claims.push(claim)
  }
  return claims
}

async function finishResume(
  claim: ClaimedResume,
  result: Awaited<ReturnType<ResumeExecutionRunner['execute']>>,
  now: Date,
  retryDelayMs: number
): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await tx
      .select()
      .from(pausedExecutions)
      .where(eq(pausedExecutions.id, claim.pausedExecutionId))
      .for('update')
      .limit(1)
      .then((rows) => rows[0])
    if (!row) return
    const entry = await tx
      .select()
      .from(resumeQueue)
      .where(eq(resumeQueue.id, claim.entryId))
      .for('update')
      .limit(1)
      .then((rows) => rows[0])
    if (!entry || entry.status !== 'claimed') return

    const points = pausePointRecord(row.pausePoints)
    const point = points[claim.contextId]
    if (!point) {
      await tx
        .update(resumeQueue)
        .set({ status: 'failed', completedAt: now, failureReason: 'Pause point no longer exists' })
        .where(eq(resumeQueue.id, claim.entryId))
      return
    }

    if (result.ok) {
      point.resumeStatus = 'resumed'
      point.response = result.output
      point.automaticResumeWaitingReason = undefined
      const status =
        result.status === 'paused' || !allResumed(points) ? 'partially_resumed' : 'fully_resumed'
      await tx
        .update(resumeQueue)
        .set({ status: 'completed', completedAt: now, failureReason: null })
        .where(eq(resumeQueue.id, claim.entryId))
      await tx
        .update(pausedExecutions)
        .set({
          pausePoints: points,
          resumedCount: row.resumedCount + 1,
          automaticResumeRetryCount: 0,
          status,
          nextResumeAt: nextResumeAt(points, now),
          updatedAt: now,
        })
        .where(eq(pausedExecutions.id, row.id))
      return
    }

    const retryCount = row.automaticResumeRetryCount + 1
    point.resumeStatus = 'paused'
    point.automaticResumeWaitingReason = result.error
    const retryAt = result.retryable ? new Date(now.getTime() + retryDelayMs) : null
    await tx
      .update(resumeQueue)
      .set({ status: 'failed', completedAt: now, failureReason: result.error })
      .where(eq(resumeQueue.id, claim.entryId))
    await tx
      .update(pausedExecutions)
      .set({
        pausePoints: points,
        metadata: waitingMetadata(
          row.metadata,
          claim.contextId,
          result.error,
          retryCount,
          now,
          result.retryable
        ),
        automaticResumeRetryCount: retryCount,
        status: row.status === 'partially_resumed' ? 'partially_resumed' : 'paused',
        nextResumeAt: retryAt,
        updatedAt: now,
      })
      .where(eq(pausedExecutions.id, row.id))
  })
}

export function createDrizzleResumePoller(options: DrizzleResumePollerOptions): ResumePoller {
  const now = options.now ?? (() => new Date())
  const retryDelayMs = options.retryDelayMs ?? 60_000
  const staleClaimMs = options.staleClaimMs ?? 180_000
  let running = false
  return {
    async run(command: ResumePollCommandV1): Promise<ResumePollResultV1> {
      if (running) {
        return {
          contractVersion: EXECUTION_CONTRACTS_VERSION,
          commandId: command.commandId,
          status: 'skipped',
          claimedRows: 0,
          dispatched: 0,
          failures: [],
          message: 'Polling already in progress - skipped',
        }
      }
      running = true
      try {
        const startedAt = now()
        const recovered = await recoverStaleClaims(startedAt, staleClaimMs)
        const admission = await admitDueResume(startedAt)
        const unique = new Map(
          [...recovered, ...admission.claims].map((claim) => [claim.entryId, claim] as const)
        )
        let dispatched = 0
        const failures: ResumePollResultV1['failures'] = [...admission.failures]
        for (const claim of unique.values()) {
          const executionCommand: ResumeExecutionCommandV1 = {
            contractVersion: EXECUTION_CONTRACTS_VERSION,
            resumeEntryId: claim.entryId,
            pausedExecutionId: claim.pausedExecutionId,
            workflowId: claim.workflowId,
            executionId: claim.executionId,
            contextId: claim.contextId,
            userId: claim.userId,
            workspaceId: claim.workspaceId,
            snapshot: claim.snapshot,
            input: claim.input,
          }
          try {
            const result = await options.runner.execute(executionCommand)
            await finishResume(claim, result, now(), retryDelayMs)
            if (result.ok) {
              dispatched++
            } else {
              failures.push({
                executionId: claim.executionId,
                contextId: claim.contextId,
                error: result.error,
              })
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Resume execution failed'
            await finishResume(
              claim,
              {
                contractVersion: EXECUTION_CONTRACTS_VERSION,
                ok: false,
                retryable: true,
                error: message,
              },
              now(),
              retryDelayMs
            )
            failures.push({
              executionId: claim.executionId,
              contextId: claim.contextId,
              error: message,
            })
          }
        }
        return {
          contractVersion: EXECUTION_CONTRACTS_VERSION,
          commandId: command.commandId,
          status: 'completed',
          claimedRows: admission.candidateCount + recovered.length,
          dispatched,
          failures,
        }
      } finally {
        running = false
      }
    },
  }
}

import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { EXECUTION_CONTRACTS_VERSION } from '@sim/execution-contracts'
import type {
  ResumeExecutionCommandV1,
  ResumeExecutionResultV1,
} from '@sim/execution-contracts/resume-poll'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createWorkerApplication } from '@/bootstrap/application/create-worker-application'
import { createSandboxHttpServer } from '@/http/create-sandbox-http-server'
import { createWorkerHttpServer } from '@/http/create-worker-http-server'
import { createHttpResumeExecutionRunner } from '@/jobs/resume/http-resume-execution-runner'
import type { ResumeExecutionRunner } from '@/jobs/resume/resume-execution-runner'
import { createRestrictedTestSandbox } from '@/sandbox/restricted-test/create-restricted-test-sandbox'

const disposableDatabaseEnabled =
  process.env.SIM_TEST_DATABASE_DISPOSABLE === '1' && Boolean(process.env.DATABASE_URL)

if (process.env.SIM_REQUIRE_POSTGRES_TEST === '1' && !disposableDatabaseEnabled) {
  throw new Error('PostgreSQL integration requires DATABASE_URL and SIM_TEST_DATABASE_DISPOSABLE=1')
}

const suite = describe.runIf(disposableDatabaseEnabled)

suite('durable resume poll state machine', () => {
  let currentNow = new Date('2026-07-30T00:00:00.000Z')
  let behavior: (command: ResumeExecutionCommandV1) => Promise<ResumeExecutionResultV1>
  let sandboxServer: ReturnType<typeof createSandboxHttpServer>
  let workerServer: ReturnType<typeof createWorkerHttpServer>
  let worker: ReturnType<typeof createWorkerApplication>
  let workerBaseUrl: string
  let sandboxBaseUrl: string

  beforeAll(async () => {
    const [{ db }, { sql }, { createDrizzleResumePoller }] = await Promise.all([
      import('@sim/db'),
      import('drizzle-orm'),
      import('@/jobs/resume/create-drizzle-resume-poller'),
    ])
    for (const statement of [
      'drop table if exists resume_queue',
      'drop table if exists paused_executions',
      `create table paused_executions (
        id text primary key, workflow_id text not null, execution_id text not null unique,
        execution_snapshot jsonb not null, pause_points jsonb not null,
        total_pause_count integer not null, resumed_count integer not null default 0,
        automatic_resume_retry_count integer not null default 0,
        status text not null default 'paused', metadata jsonb not null default '{}',
        paused_at timestamp not null default now(), updated_at timestamp not null default now(),
        expires_at timestamp, next_resume_at timestamp
      )`,
      `create table resume_queue (
        id text primary key, paused_execution_id text not null references paused_executions(id),
        parent_execution_id text not null, new_execution_id text not null,
        context_id text not null, resume_input jsonb, status text not null,
        queued_at timestamp not null default now(), claimed_at timestamp,
        completed_at timestamp, failure_reason text
      )`,
    ]) {
      await db.execute(sql.raw(statement))
    }

    behavior = async () => ({
      contractVersion: EXECUTION_CONTRACTS_VERSION,
      ok: true,
      status: 'completed',
      output: { resumed: true },
    })
    const resumeExecution: ResumeExecutionRunner = {
      execute: (command) => behavior(command),
    }
    sandboxServer = createSandboxHttpServer({
      sandbox: createRestrictedTestSandbox(),
      internalToken: 'internal-token',
      resumeExecution,
    })
    sandboxServer.listen(0, '127.0.0.1')
    await once(sandboxServer, 'listening')
    const sandboxAddress = sandboxServer.address() as AddressInfo
    sandboxBaseUrl = `http://127.0.0.1:${sandboxAddress.port}`

    const poller = createDrizzleResumePoller({
      runner: createHttpResumeExecutionRunner({
        baseUrl: sandboxBaseUrl,
        internalToken: 'internal-token',
      }),
      now: () => currentNow,
      retryDelayMs: 60_000,
      staleClaimMs: 180_000,
    })
    worker = createWorkerApplication({ resumePoller: poller })
    await worker.start()
    workerServer = createWorkerHttpServer({
      application: worker,
      internalToken: 'internal-token',
    })
    workerServer.listen(0, '127.0.0.1')
    await once(workerServer, 'listening')
    const workerAddress = workerServer.address() as AddressInfo
    workerBaseUrl = `http://127.0.0.1:${workerAddress.port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => workerServer.close(() => resolve()))
    await new Promise<void>((resolve) => sandboxServer.close(() => resolve()))
    await worker.stop()
  })

  async function insertPaused(input: {
    id: string
    executionId: string
    metadata?: Record<string, unknown>
    snapshot?: Record<string, unknown>
    pausePoints?: Record<string, Record<string, unknown>>
  }) {
    const [{ db }, { pausedExecutions }] = await Promise.all([
      import('@sim/db'),
      import('@sim/db/schema'),
    ])
    await db.insert(pausedExecutions).values({
      id: input.id,
      workflowId: 'workflow-1',
      executionId: input.executionId,
      executionSnapshot:
        input.snapshot ??
        ({
          snapshot: JSON.stringify({
            metadata: {
              workspaceId: 'workspace-1',
              userId: 'user-1',
              billingAttribution: {
                workspaceId: 'workspace-1',
                actorUserId: 'user-1',
              },
            },
          }),
        } as Record<string, unknown>),
      pausePoints: {
        ...(input.pausePoints ?? {
          'context-1': {
            contextId: 'context-1',
            pauseKind: 'time',
            resumeStatus: 'paused',
            snapshotReady: true,
            resumeAt: currentNow.toISOString(),
          },
        }),
      },
      totalPauseCount: Object.keys(input.pausePoints ?? { 'context-1': true }).length,
      resumedCount: 0,
      automaticResumeRetryCount: 0,
      status: 'paused',
      metadata: input.metadata ?? {
        executorUserId: 'user-1',
        workspaceId: 'workspace-1',
      },
      pausedAt: currentNow,
      updatedAt: currentNow,
      nextResumeAt: currentNow,
    })
  }

  async function poll(commandId: string) {
    const { createHttpWorkerResumePollCommand } = await import(
      '../../../api/src/modules/execution/control/infrastructure/http-worker-resume-poll-command'
    )
    return createHttpWorkerResumePollCommand({
      baseUrl: workerBaseUrl,
      internalToken: 'internal-token',
      now: () => currentNow,
    }).run(commandId)
  }

  it('executes API client -> Worker HTTP -> PG claim -> resume engine -> terminal state', async () => {
    await insertPaused({ id: 'paused-success', executionId: 'execution-success' })
    const result = await poll('poll-success')
    expect(result).toMatchObject({ claimedRows: 1, dispatched: 1, failures: [] })

    const [{ db }, { pausedExecutions, resumeQueue }, { eq }] = await Promise.all([
      import('@sim/db'),
      import('@sim/db/schema'),
      import('drizzle-orm'),
    ])
    const [paused] = await db
      .select()
      .from(pausedExecutions)
      .where(eq(pausedExecutions.id, 'paused-success'))
    const [entry] = await db
      .select()
      .from(resumeQueue)
      .where(eq(resumeQueue.pausedExecutionId, 'paused-success'))
    expect(paused).toMatchObject({
      status: 'fully_resumed',
      resumedCount: 1,
      automaticResumeRetryCount: 0,
      nextResumeAt: null,
    })
    expect(paused?.pausePoints).toMatchObject({
      'context-1': { resumeStatus: 'resumed', response: { resumed: true } },
    })
    expect(entry).toMatchObject({
      status: 'completed',
      newExecutionId: 'execution-success',
      failureReason: null,
    })

    await expect(poll('poll-success-duplicate')).resolves.toMatchObject({
      claimedRows: 0,
      dispatched: 0,
    })
    const entries = await db
      .select()
      .from(resumeQueue)
      .where(eq(resumeQueue.pausedExecutionId, 'paused-success'))
    expect(entries).toHaveLength(1)
  })

  it('persists retryable failure, restores paused state, then succeeds once due again', async () => {
    await insertPaused({ id: 'paused-retry', executionId: 'execution-retry' })
    behavior = async () => ({
      contractVersion: EXECUTION_CONTRACTS_VERSION,
      ok: false,
      retryable: true,
      error: 'sandbox temporarily unavailable',
    })
    await expect(poll('poll-retry-failure')).resolves.toMatchObject({
      claimedRows: 1,
      dispatched: 0,
      failures: [{ executionId: 'execution-retry' }],
    })

    const [{ db }, { pausedExecutions, resumeQueue }, { eq }] = await Promise.all([
      import('@sim/db'),
      import('@sim/db/schema'),
      import('drizzle-orm'),
    ])
    const [failedPause] = await db
      .select()
      .from(pausedExecutions)
      .where(eq(pausedExecutions.id, 'paused-retry'))
    expect(failedPause).toMatchObject({
      status: 'paused',
      automaticResumeRetryCount: 1,
      nextResumeAt: new Date('2026-07-30T00:01:00.000Z'),
    })
    expect(failedPause?.pausePoints).toMatchObject({
      'context-1': { resumeStatus: 'paused' },
    })

    behavior = async () => ({
      contractVersion: EXECUTION_CONTRACTS_VERSION,
      ok: true,
      status: 'completed',
    })
    currentNow = new Date('2026-07-30T00:01:00.000Z')
    await expect(poll('poll-retry-success')).resolves.toMatchObject({
      claimedRows: 1,
      dispatched: 1,
    })
    const entries = await db
      .select()
      .from(resumeQueue)
      .where(eq(resumeQueue.pausedExecutionId, 'paused-retry'))
    expect(entries.map((entry) => entry.status)).toEqual(['failed', 'completed'])
  })

  it('supports bounded legacy metadata and blocks incomplete metadata without queue admission', async () => {
    currentNow = new Date('2026-07-30T00:02:00.000Z')
    await insertPaused({
      id: 'paused-legacy',
      executionId: 'execution-legacy',
      metadata: { executorUserId: 'legacy-user' },
    })
    await insertPaused({
      id: 'paused-incomplete',
      executionId: 'execution-incomplete',
      metadata: {},
      snapshot: { snapshot: '{}' },
    })
    await insertPaused({
      id: 'paused-oversized',
      executionId: 'execution-oversized',
    })
    const [{ db: oversizedDb }, { sql: oversizedSql }] = await Promise.all([
      import('@sim/db'),
      import('drizzle-orm'),
    ])
    await oversizedDb.execute(oversizedSql`
      update paused_executions
      set execution_snapshot = jsonb_build_object('snapshot', repeat('x', ${16 * 1024 * 1024}))
      where id = 'paused-oversized'
    `)
    const metadataResult = await poll('poll-metadata')
    expect(metadataResult).toMatchObject({
      claimedRows: 3,
      dispatched: 1,
    })
    expect(metadataResult.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ executionId: 'execution-incomplete' }),
        expect.objectContaining({ executionId: 'execution-oversized' }),
      ])
    )

    const [{ db }, { pausedExecutions, resumeQueue }, { eq }] = await Promise.all([
      import('@sim/db'),
      import('@sim/db/schema'),
      import('drizzle-orm'),
    ])
    const [incomplete] = await db
      .select()
      .from(pausedExecutions)
      .where(eq(pausedExecutions.id, 'paused-incomplete'))
    expect(incomplete).toMatchObject({
      status: 'paused',
      automaticResumeRetryCount: 1,
      nextResumeAt: null,
    })
    expect(
      await db
        .select()
        .from(resumeQueue)
        .where(eq(resumeQueue.pausedExecutionId, 'paused-incomplete'))
    ).toHaveLength(0)
    const [oversized] = await db
      .select()
      .from(pausedExecutions)
      .where(eq(pausedExecutions.id, 'paused-oversized'))
    expect(oversized).toMatchObject({
      status: 'paused',
      automaticResumeRetryCount: 1,
      nextResumeAt: null,
    })
    expect(oversized?.metadata).toMatchObject({
      automaticResumeWaiting: {
        state: 'intervention_required',
        reason: expect.stringContaining('16 MiB'),
      },
    })
    expect(
      await db
        .select()
        .from(resumeQueue)
        .where(eq(resumeQueue.pausedExecutionId, 'paused-oversized'))
    ).toHaveLength(0)
  })

  it('returns donor-compatible skipped semantics for an overlapping poll', async () => {
    currentNow = new Date('2026-07-30T00:03:00.000Z')
    await insertPaused({ id: 'paused-overlap', executionId: 'execution-overlap' })
    let release: (() => void) | undefined
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    const started = vi.fn()
    behavior = async () => {
      started()
      await blocked
      return {
        contractVersion: EXECUTION_CONTRACTS_VERSION,
        ok: true,
        status: 'completed',
      }
    }
    const first = poll('poll-overlap-first')
    await vi.waitFor(() => expect(started).toHaveBeenCalledOnce())
    await expect(poll('poll-overlap-second')).resolves.toMatchObject({
      status: 'skipped',
      claimedRows: 0,
      dispatched: 0,
    })
    release?.()
    await expect(first).resolves.toMatchObject({ status: 'completed', dispatched: 1 })
  })

  it('serializes two independent poller instances against one due row', async () => {
    currentNow = new Date('2026-07-30T00:04:00.000Z')
    await insertPaused({ id: 'paused-multi-poller', executionId: 'execution-multi-poller' })
    let release: (() => void) | undefined
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    const started = vi.fn()
    behavior = async () => {
      started()
      await blocked
      return {
        contractVersion: EXECUTION_CONTRACTS_VERSION,
        ok: true,
        status: 'completed',
      }
    }
    const { createDrizzleResumePoller } = await import('@/jobs/resume/create-drizzle-resume-poller')
    const createIndependentPoller = () =>
      createDrizzleResumePoller({
        runner: createHttpResumeExecutionRunner({
          baseUrl: sandboxBaseUrl,
          internalToken: 'internal-token',
        }),
        now: () => currentNow,
      })
    const first = createIndependentPoller().run({
      contractVersion: EXECUTION_CONTRACTS_VERSION,
      commandId: 'multi-poller-first',
      requestedAt: currentNow.toISOString(),
    })
    await vi.waitFor(() => expect(started).toHaveBeenCalledOnce())
    const second = createIndependentPoller().run({
      contractVersion: EXECUTION_CONTRACTS_VERSION,
      commandId: 'multi-poller-second',
      requestedAt: currentNow.toISOString(),
    })
    await expect(second).resolves.toMatchObject({ claimedRows: 0, dispatched: 0 })
    release?.()
    await expect(first).resolves.toMatchObject({ claimedRows: 1, dispatched: 1 })

    const [{ db }, { resumeQueue }, { eq }] = await Promise.all([
      import('@sim/db'),
      import('@sim/db/schema'),
      import('drizzle-orm'),
    ])
    expect(
      await db
        .select()
        .from(resumeQueue)
        .where(eq(resumeQueue.pausedExecutionId, 'paused-multi-poller'))
    ).toHaveLength(1)
  })

  it('recomputes the lease so two already-due chained points both advance', async () => {
    currentNow = new Date('2026-07-30T00:05:00.000Z')
    behavior = async () => ({
      contractVersion: EXECUTION_CONTRACTS_VERSION,
      ok: true,
      status: 'completed',
    })
    await insertPaused({
      id: 'paused-chained',
      executionId: 'execution-chained',
      pausePoints: {
        first: {
          contextId: 'first',
          pauseKind: 'time',
          resumeStatus: 'paused',
          snapshotReady: true,
          resumeAt: '2026-07-30T00:04:00.000Z',
        },
        second: {
          contextId: 'second',
          pauseKind: 'time',
          resumeStatus: 'paused',
          snapshotReady: true,
          resumeAt: '2026-07-30T00:04:30.000Z',
        },
      },
    })
    await expect(poll('poll-chained-first')).resolves.toMatchObject({
      claimedRows: 1,
      dispatched: 1,
    })
    await expect(poll('poll-chained-second')).resolves.toMatchObject({
      claimedRows: 1,
      dispatched: 1,
    })
    const [{ db }, { pausedExecutions, resumeQueue }, { eq }] = await Promise.all([
      import('@sim/db'),
      import('@sim/db/schema'),
      import('drizzle-orm'),
    ])
    const [paused] = await db
      .select()
      .from(pausedExecutions)
      .where(eq(pausedExecutions.id, 'paused-chained'))
    expect(paused).toMatchObject({
      status: 'fully_resumed',
      resumedCount: 2,
      nextResumeAt: null,
    })
    expect(
      await db.select().from(resumeQueue).where(eq(resumeQueue.pausedExecutionId, 'paused-chained'))
    ).toHaveLength(2)
  })

  it('recovers a stale claimed entry with the same idempotency key', async () => {
    currentNow = new Date('2026-07-30T00:06:00.000Z')
    let release: (() => void) | undefined
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    behavior = vi.fn(async () => {
      await blocked
      return {
        contractVersion: EXECUTION_CONTRACTS_VERSION,
        ok: true as const,
        status: 'completed' as const,
      }
    })
    await insertPaused({ id: 'paused-stale', executionId: 'execution-stale' })
    const [{ db }, { pausedExecutions, resumeQueue }, { eq }] = await Promise.all([
      import('@sim/db'),
      import('@sim/db/schema'),
      import('drizzle-orm'),
    ])
    await db.insert(resumeQueue).values({
      id: 'resume-stale',
      pausedExecutionId: 'paused-stale',
      parentExecutionId: 'execution-stale',
      newExecutionId: 'execution-stale',
      contextId: 'context-1',
      resumeInput: {},
      status: 'claimed',
      queuedAt: new Date('2026-07-30T00:00:00.000Z'),
      claimedAt: new Date('2026-07-30T00:00:00.000Z'),
    })
    await db
      .update(pausedExecutions)
      .set({
        pausePoints: {
          'context-1': {
            contextId: 'context-1',
            pauseKind: 'time',
            resumeStatus: 'resuming',
            snapshotReady: true,
            resumeAt: currentNow.toISOString(),
          },
        },
        nextResumeAt: null,
      })
      .where(eq(pausedExecutions.id, 'paused-stale'))

    const { createDrizzleResumePoller } = await import('@/jobs/resume/create-drizzle-resume-poller')
    const createIndependentPoller = () =>
      createDrizzleResumePoller({
        runner: createHttpResumeExecutionRunner({
          baseUrl: sandboxBaseUrl,
          internalToken: 'internal-token',
        }),
        now: () => currentNow,
        staleClaimMs: 180_000,
      })
    const first = createIndependentPoller().run({
      contractVersion: EXECUTION_CONTRACTS_VERSION,
      commandId: 'stale-first',
      requestedAt: currentNow.toISOString(),
    })
    await vi.waitFor(() => expect(behavior).toHaveBeenCalledOnce())
    await expect(
      createIndependentPoller().run({
        contractVersion: EXECUTION_CONTRACTS_VERSION,
        commandId: 'stale-second',
        requestedAt: currentNow.toISOString(),
      })
    ).resolves.toMatchObject({ claimedRows: 0, dispatched: 0 })
    release?.()
    await expect(first).resolves.toMatchObject({
      claimedRows: 1,
      dispatched: 1,
    })
    expect(behavior).toHaveBeenCalledOnce()
    expect(behavior).toHaveBeenCalledWith(
      expect.objectContaining({ resumeEntryId: 'resume-stale' })
    )
  })

  it('rejects bad internal auth and an invalid command version at the real Worker HTTP seam', async () => {
    const unauthorized = await fetch(`${workerBaseUrl}/internal/resume/poll`, {
      method: 'POST',
      headers: { authorization: 'Bearer wrong', 'content-type': 'application/json' },
      body: '{}',
    })
    expect(unauthorized.status).toBe(401)
    const invalid = await fetch(`${workerBaseUrl}/internal/resume/poll`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer internal-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        contractVersion: 999,
        commandId: 'invalid',
        requestedAt: currentNow.toISOString(),
      }),
    })
    expect(invalid.status).toBe(400)
  })
})

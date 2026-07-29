import type { SandboxResourcePolicyV1 } from '@sim/execution-contracts/job-control'
import type { ExecutionJobV1 } from '@sim/execution-contracts/jobs'
import { describe, expect, it, vi } from 'vitest'
import { createWorkerApplication } from '@/bootstrap/application/create-worker-application'
import { createInMemoryExecutionJobQueue } from '@/jobs/queue/in-memory-execution-job-queue'
import { createInMemoryExecutionState } from '@/jobs/state/in-memory-execution-state'
import type { SandboxAuditRecord } from '@/sandbox/interface/types'
import { createRestrictedTestSandbox } from '@/sandbox/restricted-test/create-restricted-test-sandbox'

const basePolicy: SandboxResourcePolicyV1 = {
  contractVersion: 1,
  network: 'deny',
  filesystem: {
    mode: 'ephemeral',
    readOnlyMounts: [],
    writableRoot: '/tmp/job',
  },
  cpuTimeMs: 100,
  memoryMiB: 32,
  wallClockMs: 1_000,
  maxInputBytes: 1024,
  secrets: {
    mode: 'references-only',
    credentialRefs: ['credential:test'],
  },
}

function job(
  operation: 'delay' | 'echo' | 'fatal-failure' | 'transient-failure',
  overrides: Record<string, unknown> = {}
): ExecutionJobV1 {
  return {
    contractVersion: 1,
    jobId: 'job-1',
    executionId: 'execution-1',
    workspaceId: 'workspace-1',
    workflowId: 'workflow-1',
    kind: 'run',
    requestedAt: '2026-07-30T00:00:00.000Z',
    trace: {
      traceId: 'a'.repeat(32),
      spanId: 'b'.repeat(16),
      traceFlags: '01',
      correlationId: 'request-1',
    },
    payload: {
      contractVersion: 1,
      type: 'sandbox-test',
      operation,
      input: { value: 'safe' },
      delayMs: 0,
      failuresBeforeSuccess: 0,
      policy: basePolicy,
      ...overrides,
    },
  }
}

function fixture(options: { maxAttempts?: number } = {}) {
  const queue = createInMemoryExecutionJobQueue()
  const state = createInMemoryExecutionState()
  const auditRecords: SandboxAuditRecord[] = []
  const sandbox = createRestrictedTestSandbox({
    record(record) {
      auditRecords.push(record)
    },
  })
  const application = createWorkerApplication({
    jobQueue: queue,
    jobState: state,
    events: state,
    sandbox,
    maxAttempts: options.maxAttempts,
  })
  return { application, auditRecords, queue, state }
}

describe('execution job coordinator', () => {
  it('acks an ordered successful execution and deduplicates a repeated submission', async () => {
    const { application, auditRecords, queue, state } = fixture()
    await application.start()

    const first = await application.submitJob(job('echo'))
    await queue.waitForIdle()
    const duplicate = await application.submitJob(job('echo'))
    await queue.inject(job('echo'), 'duplicate-delivery-record')
    await queue.waitForIdle()
    await application.stop()

    expect(first.duplicate).toBe(false)
    expect(duplicate.duplicate).toBe(true)
    expect(state.events('execution-1').map((event) => [event.sequence, event.type])).toEqual([
      [0, 'started'],
      [1, 'completed'],
    ])
    expect(state.jobStatus('job-1')).toBe('completed')
    expect(queue.snapshot()[1]).toMatchObject({
      jobId: 'duplicate-delivery-record',
      state: 'acked',
    })
    expect(auditRecords.map((record) => record.phase)).toEqual(['started', 'completed'])
    expect(auditRecords[0]?.policy).toEqual(basePolicy)
    expect(JSON.stringify(auditRecords)).not.toContain('secret-value')
  })

  it('retries a transient failure and then reaches one terminal state', async () => {
    const { application, queue, state } = fixture()
    await application.start()
    await application.submitJob(
      job('transient-failure', {
        failuresBeforeSuccess: 1,
      })
    )
    await queue.waitForIdle()
    await application.stop()

    expect(state.events('execution-1').map((event) => event.type)).toEqual([
      'started',
      'retry-scheduled',
      'started',
      'completed',
    ])
    expect(queue.snapshot()[0]).toMatchObject({ attempt: 2, state: 'acked' })
    expect(state.jobStatus('job-1')).toBe('completed')
  })

  it('dead-letters a retryable failure after the retry budget is exhausted', async () => {
    const { application, queue, state } = fixture({ maxAttempts: 2 })
    await application.start()
    await application.submitJob(
      job('transient-failure', {
        failuresBeforeSuccess: 5,
      })
    )
    await queue.waitForIdle()
    await application.stop()

    expect(state.events('execution-1').map((event) => event.type)).toEqual([
      'started',
      'retry-scheduled',
      'started',
      'dead-lettered',
    ])
    expect(queue.snapshot()[0]).toMatchObject({ attempt: 2, state: 'dead-lettered' })
    expect(state.jobStatus('job-1')).toBe('dead-lettered')
  })

  it('cancels an active Sandbox execution idempotently', async () => {
    const { application, queue, state } = fixture()
    await application.start()
    await application.submitJob(job('delay', { delayMs: 1_000 }))
    await vi.waitFor(() => {
      expect(state.events('execution-1').map((event) => event.type)).toContain('started')
    })

    const first = await application.cancelExecution('execution-1', 'operator request')
    const duplicate = await application.cancelExecution('execution-1', 'ignored duplicate')
    await queue.waitForIdle()
    await application.stop()

    expect(first.duplicate).toBe(false)
    expect(duplicate.duplicate).toBe(true)
    expect(state.events('execution-1').map((event) => event.type)).toEqual(['started', 'cancelled'])
    expect(state.events('execution-1')[1]).toMatchObject({ reason: 'operator request' })
    expect(state.jobStatus('job-1')).toBe('cancelled')
  })

  it('turns a wall-clock timeout into a terminal failure', async () => {
    const { application, queue, state } = fixture()
    await application.start()
    await application.submitJob(
      job('delay', {
        delayMs: 100,
        policy: { ...basePolicy, wallClockMs: 10 },
      })
    )
    await queue.waitForIdle()
    await application.stop()

    expect(state.events('execution-1').map((event) => event.type)).toEqual(['started', 'failed'])
    expect(state.events('execution-1')[1]).toMatchObject({
      errorCode: 'SANDBOX_TIMEOUT',
      retryable: false,
    })
    expect(state.jobStatus('job-1')).toBe('failed')
  })

  it('dead-letters a poison delivery without emitting a fabricated execution event', async () => {
    const { application, queue, state } = fixture()
    await application.start()
    await queue.inject({ contractVersion: 999, arbitrary: true }, 'poison-1')
    await queue.waitForIdle()
    await application.stop()

    expect(queue.snapshot()[0]).toMatchObject({
      jobId: 'poison-1',
      state: 'dead-lettered',
      deadLetterReason: 'EXECUTION_JOB_INVALID',
    })
    expect(state.events()).toEqual([])
  })
})

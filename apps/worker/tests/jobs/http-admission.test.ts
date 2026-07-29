import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import type { ExecutionJobV1 } from '@sim/execution-contracts/jobs'
import { afterEach, describe, expect, it } from 'vitest'
import { createWorkerApplication } from '@/bootstrap/application/create-worker-application'
import { createWorkerHttpServer } from '@/http/create-worker-http-server'
import { createInMemoryExecutionJobQueue } from '@/jobs/queue/in-memory-execution-job-queue'
import { createInMemoryExecutionState } from '@/jobs/state/in-memory-execution-state'

function job(): ExecutionJobV1 {
  return {
    contractVersion: 1,
    jobId: 'job-http-1',
    executionId: 'execution-http-1',
    workspaceId: 'workspace-1',
    workflowId: 'workflow-1',
    kind: 'run',
    requestedAt: '2026-07-30T00:00:00.000Z',
    trace: {
      traceId: 'a'.repeat(32),
      spanId: 'b'.repeat(16),
      traceFlags: '01',
      correlationId: 'request-http-1',
    },
    payload: {
      contractVersion: 1,
      type: 'sandbox-test',
      operation: 'echo',
      input: { accepted: true },
      policy: {
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
        maxInputBytes: 1_024,
        secrets: {
          mode: 'references-only',
          credentialRefs: [],
        },
      },
    },
  }
}

describe('Worker HTTP admission', () => {
  const cleanup: Array<() => Promise<void>> = []

  afterEach(async () => {
    await Promise.all(cleanup.splice(0).map((close) => close()))
  })

  it('exposes independent health and authenticated versioned job admission', async () => {
    const queue = createInMemoryExecutionJobQueue()
    const state = createInMemoryExecutionState()
    const application = createWorkerApplication({
      jobQueue: queue,
      jobState: state,
      events: state,
      eventReader: state,
    })
    await application.start()
    const server = createWorkerHttpServer({
      application,
      internalToken: 'worker-test-token',
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    cleanup.push(
      () => new Promise<void>((resolve) => server.close(() => resolve())),
      () => application.stop()
    )
    const { port } = server.address() as AddressInfo
    const baseUrl = `http://127.0.0.1:${port}`

    expect((await fetch(`${baseUrl}/internal/live`)).status).toBe(200)
    expect((await fetch(`${baseUrl}/internal/ready`)).status).toBe(200)
    expect(
      (
        await fetch(`${baseUrl}/internal/jobs`, {
          method: 'POST',
          body: JSON.stringify(job()),
        })
      ).status
    ).toBe(401)

    const response = await fetch(`${baseUrl}/internal/jobs`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer worker-test-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify(job()),
    })
    expect(response.status).toBe(202)
    expect(await response.json()).toMatchObject({
      accepted: true,
      duplicate: false,
      jobId: 'job-http-1',
    })
    await queue.waitForIdle()
    expect(state.events('execution-http-1').map((event) => event.type)).toEqual([
      'started',
      'completed',
    ])
    const events = await fetch(`${baseUrl}/internal/executions/execution-http-1/events`, {
      headers: { authorization: 'Bearer worker-test-token' },
    })
    expect(events.status).toBe(200)
    expect(await events.json()).toMatchObject({
      events: [
        { sequence: 0, type: 'started' },
        { sequence: 1, type: 'completed' },
      ],
    })
  })
})

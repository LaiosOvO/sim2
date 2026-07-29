import { traceContextSchema } from '@sim/api-contracts/tracing'
import { describe, expect, it } from 'vitest'
import { debugCommandV1Schema, debugSessionV1Schema } from '../src/debug'
import { executionEventV1Schema } from '../src/events'
import { executionJobV1Schema } from '../src/jobs'

describe('Web to API to Worker wire contracts', () => {
  it('preserves trace context through a serialized execution job', () => {
    const webTrace = traceContextSchema.parse({
      traceId: 'a'.repeat(32),
      spanId: 'b'.repeat(16),
      traceFlags: '01',
      correlationId: 'browser-request-7',
      futureWebField: true,
    })
    const apiJob = executionJobV1Schema.parse({
      contractVersion: 1,
      jobId: 'job-1',
      executionId: 'execution-1',
      workspaceId: 'workspace-1',
      workflowId: 'workflow-1',
      kind: 'debug',
      requestedAt: '2026-07-30T00:00:00.000Z',
      trace: webTrace,
      payload: { input: 'hello' },
      futureApiField: 'ignored',
    })
    const workerJob = executionJobV1Schema.parse(JSON.parse(JSON.stringify(apiJob)))

    expect(workerJob.trace).toEqual(webTrace)
    expect(workerJob).not.toHaveProperty('futureApiField')
  })

  it('version-checks events and debug commands', () => {
    expect(
      executionEventV1Schema.parse({
        contractVersion: 1,
        eventId: 'event-1',
        executionId: 'execution-1',
        sequence: 0,
        occurredAt: '2026-07-30T00:00:01.000Z',
        type: 'started',
      }).type
    ).toBe('started')
    expect(() =>
      debugCommandV1Schema.parse({
        contractVersion: 2,
        commandId: 'command-1',
        sessionId: 'session-1',
        expectedVersion: 1,
        command: 'step',
      })
    ).toThrow()
  })

  it('distinguishes nullable state from an omitted field', () => {
    const session = debugSessionV1Schema.parse({
      contractVersion: 1,
      sessionId: 'session-1',
      executionId: 'execution-1',
      workflowId: 'workflow-1',
      draftHash: 'sha256:canvas',
      version: 1,
      state: 'paused',
      currentNodeId: null,
      breakpoints: [],
      expiresAt: '2026-07-30T01:00:00.000Z',
    })

    expect(session.currentNodeId).toBeNull()
  })
})

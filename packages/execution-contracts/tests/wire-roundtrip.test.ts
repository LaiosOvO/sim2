import { traceContextSchema } from '@sim/api-contracts/tracing'
import { describe, expect, it } from 'vitest'
import { debugCommandV1Schema, debugSessionV1Schema } from '../src/debug'
import { executionEventV1Schema } from '../src/events'
import { sandboxTestJobPayloadV1Schema } from '../src/job-control'
import { executionJobV1Schema } from '../src/jobs'
import {
  runtimeToolExecutionResultV1Schema,
  runtimeToolInvocationV1Schema,
} from '../src/runtime-tools'

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

  it('keeps runtime tool credentials as opaque references', () => {
    const invocation = runtimeToolInvocationV1Schema.parse({
      contractVersion: 1,
      toolId: 'notion_add_database_row',
      credentialRef: 'credential-1',
      params: { databaseId: 'database-1', properties: { Name: 'Task' } },
      accessToken: 'must-be-stripped',
    })

    expect(invocation).toEqual({
      contractVersion: 1,
      toolId: 'notion_add_database_row',
      credentialRef: 'credential-1',
      params: { databaseId: 'database-1', properties: { Name: 'Task' } },
    })
  })

  it('allows only opaque Sandbox credential references', () => {
    const common = {
      contractVersion: 1,
      type: 'sandbox-test',
      operation: 'echo',
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
      },
    }
    expect(
      sandboxTestJobPayloadV1Schema.parse({
        ...common,
        secrets: undefined,
        policy: {
          ...common.policy,
          secrets: {
            mode: 'references-only',
            credentialRefs: ['credential-1'],
          },
        },
      }).policy.secrets.credentialRefs
    ).toEqual(['credential-1'])
    expect(() =>
      sandboxTestJobPayloadV1Schema.parse({
        ...common,
        policy: {
          ...common.policy,
          secrets: {
            mode: 'references-only',
            credentialRefs: ['credential-1'],
            values: { API_KEY: 'must-not-cross-the-wire' },
          },
        },
      })
    ).toThrow()
  })

  it('version-checks runtime registry failures', () => {
    const result = runtimeToolExecutionResultV1Schema.parse({
      contractVersion: 1,
      ok: false,
      error: {
        contractVersion: 1,
        code: 'RUNTIME_TOOL_NOT_FOUND',
        message: 'Unknown runtime tool',
        requestedToolId: 'missing_tool',
      },
    })

    expect(result.ok).toBe(false)
    expect(() =>
      runtimeToolExecutionResultV1Schema.parse({
        contractVersion: 2,
        ok: false,
        error: {
          contractVersion: 2,
          code: 'RUNTIME_TOOL_NOT_FOUND',
          message: 'Unknown runtime tool',
          requestedToolId: 'missing_tool',
        },
      })
    ).toThrow()
  })
})

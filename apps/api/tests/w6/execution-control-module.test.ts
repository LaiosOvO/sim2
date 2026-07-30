import type { SessionRequestContext } from '@sim/api-contracts/auth'
import { createRequestAuthenticator } from '@sim/auth/request-context'
import { EXECUTION_CONTRACTS_VERSION } from '@sim/execution-contracts'
import type { ResumePollResultV1 } from '@sim/execution-contracts/resume-poll'
import { describe, expect, it, vi } from 'vitest'
import { createApiApplication } from '@/bootstrap/application/create-api-application'
import {
  createExecutionControlModule,
  ExecutionPayloadUnavailableError,
  type ExecutionStatusReader,
} from '@/modules/execution/control'
import { createObjectStoreExecutionPayloadMaterializer } from '@/modules/execution/control/infrastructure/object-store-execution-payload-materializer'

const session: SessionRequestContext = {
  authContextVersion: 1,
  authenticationMethod: 'session',
  actor: { id: 'user-1', type: 'user' },
  requestId: 'request-1',
  credentialId: 'session-1',
  activeOrganizationId: null,
  permissions: [],
}

function authentication() {
  return createRequestAuthenticator({
    sessions: {
      async verify(headers) {
        return headers.get('cookie') === 'session=valid'
          ? {
              verified: true,
              credential: {
                actor: session.actor,
                sessionId: session.credentialId,
                activeOrganizationId: null,
              },
            }
          : { verified: false, reason: 'invalid' }
      },
    },
  })
}

function dependencies() {
  const readExecution = vi.fn<ExecutionStatusReader['read']>(async () => ({
    execution: {
      executionId: 'execution-1',
      workflowId: 'workflow-1',
      workspaceId: 'workspace-1',
      status: 'completed',
      level: 'info',
      trigger: 'api',
      startedAt: new Date('2026-07-30T00:00:00.000Z'),
      endedAt: new Date('2026-07-30T00:00:01.000Z'),
      totalDurationMs: 1000,
      executionData: {
        finalOutput: { answer: 42 },
        traceSpans: [{ blockId: 'agent', output: { text: 'ok' } }],
      },
      costTotal: '0.01',
    },
    paused: null,
  }))
  return {
    authentication: authentication(),
    workflowAuthorizer: {
      authorize: vi.fn(async () => ({ allowed: true as const, workspaceId: 'workspace-1' })),
    },
    jobs: {
      read: vi.fn(async () => ({
        id: 'job-1',
        status: 'completed' as const,
        metadata: { userId: 'user-1' } as Record<string, unknown>,
        output: { answer: 42 },
      })),
    },
    executions: {
      read: readExecution,
    },
    payloads: {
      materialize: vi.fn(async (row) => row.executionData),
    },
    resumePoll: {
      run: vi.fn(
        async (commandId): Promise<ResumePollResultV1> => ({
          contractVersion: EXECUTION_CONTRACTS_VERSION,
          commandId,
          status: 'completed',
          claimedRows: 1,
          dispatched: 1,
          failures: [],
        })
      ),
    },
    cronSecret: 'cron-secret',
  }
}

describe('W6 Group B execution-control module', () => {
  it('preserves donor validation-before-auth ordering without touching persistence', async () => {
    const deps = dependencies()
    const app = createApiApplication({ executionControl: createExecutionControlModule(deps) })
    const response = await app.handle(new Request('http://api.test/api/jobs/%E0%A4%A'))
    expect(response.status).toBe(400)
    expect(deps.jobs.read).not.toHaveBeenCalled()
  })

  it('validates malformed execution parameters before authentication', async () => {
    const deps = dependencies()
    const app = createApiApplication({ executionControl: createExecutionControlModule(deps) })
    const response = await app.handle(
      new Request('http://api.test/api/workflows/%E0%A4%A/executions/execution-1')
    )
    expect(response.status).toBe(400)
    expect(deps.workflowAuthorizer.authorize).not.toHaveBeenCalled()
    expect(deps.executions.read).not.toHaveBeenCalled()
  })

  it('returns an owned async job without exposing queue internals', async () => {
    const deps = dependencies()
    const app = createApiApplication({ executionControl: createExecutionControlModule(deps) })
    const response = await app.handle(
      new Request('http://api.test/api/jobs/job-1', { headers: { cookie: 'session=valid' } })
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      success: true,
      taskId: 'job-1',
      status: 'completed',
      metadata: { userId: 'user-1' },
      output: { answer: 42 },
    })
    expect(response.headers.get('x-sim-api-inventory-id')).toBe('API-0138')
  })

  it('uses workflow authorization when workflow ownership metadata is present', async () => {
    const deps = dependencies()
    deps.jobs.read.mockResolvedValue({
      id: 'job-1',
      status: 'completed',
      metadata: {
        workflowId: 'workflow-1',
        userId: 'someone-else',
      } as Record<string, unknown>,
      output: { answer: 42 },
    })
    const app = createApiApplication({ executionControl: createExecutionControlModule(deps) })
    const response = await app.handle(
      new Request('http://api.test/api/jobs/job-1', { headers: { cookie: 'session=valid' } })
    )
    expect(response.status).toBe(200)
    expect(deps.workflowAuthorizer.authorize).toHaveBeenCalledWith(
      expect.objectContaining({ actor: { id: 'user-1', type: 'user' } }),
      'workflow-1'
    )
  })

  it('maps Trigger.dev not-found errors to the donor 404 response', async () => {
    const deps = dependencies()
    deps.jobs.read.mockRejectedValue(new Error('Trigger.dev run not found'))
    const app = createApiApplication({ executionControl: createExecutionControlModule(deps) })
    const response = await app.handle(
      new Request('http://api.test/api/jobs/missing', { headers: { cookie: 'session=valid' } })
    )
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Task not found' })
  })

  it('does not materialize heavy execution data for ordinary status polling', async () => {
    const deps = dependencies()
    const app = createApiApplication({ executionControl: createExecutionControlModule(deps) })
    const response = await app.handle(
      new Request('http://api.test/api/workflows/workflow-1/executions/execution-1', {
        headers: { cookie: 'session=valid' },
      })
    )
    expect(response.status).toBe(200)
    expect(deps.payloads.materialize).not.toHaveBeenCalled()
    expect(deps.executions.read).toHaveBeenCalledOnce()
    expect((await response.json()).finalOutput).toBeNull()
  })

  it('materializes only when requested and projects selected outputs', async () => {
    const deps = dependencies()
    const app = createApiApplication({ executionControl: createExecutionControlModule(deps) })
    const response = await app.handle(
      new Request(
        'http://api.test/api/workflows/workflow-1/executions/execution-1?includeOutput=true&selectedOutputs=agent.text',
        { headers: { cookie: 'session=valid' } }
      )
    )
    expect(response.status).toBe(200)
    expect(deps.payloads.materialize).toHaveBeenCalledOnce()
    expect(deps.executions.read).toHaveBeenCalledOnce()
    expect(await response.json()).toMatchObject({
      finalOutput: { answer: 42 },
      blockOutputs: { 'agent.text': 'ok' },
    })
  })

  it('materializes external output, selected block outputs, and failures at the server seam', async () => {
    const objects = {
      readJson: vi.fn(async () => ({
        finalOutput: { answer: 84 },
        error: { message: 'external failure' },
        traceSpans: [{ blockId: 'agent', output: { text: 'external ok' } }],
      })),
    }
    const deps = {
      ...dependencies(),
      payloads: createObjectStoreExecutionPayloadMaterializer(objects),
    }
    const current = await deps.executions.read('workflow-1', 'execution-1')
    if (!current) throw new Error('Execution fixture is unavailable')
    deps.executions.read.mockResolvedValue({
      execution: {
        ...current.execution,
        status: 'failed',
        executionData: {
          traceStoreRef: {
            __simLargeValueRef: true,
            version: 1,
            id: 'lv_abcdefghijkl',
            kind: 'object',
            key: 'execution/workspace-1/workflow-1/execution-1/large-value-lv_abcdefghijkl.json',
            size: 4096,
            executionId: 'execution-1',
          },
          completionFailure: 'inline fallback',
        },
      },
      paused: null,
    })
    const app = createApiApplication({ executionControl: createExecutionControlModule(deps) })
    const failed = await app.handle(
      new Request(
        'http://api.test/api/workflows/workflow-1/executions/execution-1?selectedOutputs=agent.text',
        { headers: { cookie: 'session=valid' } }
      )
    )
    expect(failed.status).toBe(200)
    expect(await failed.json()).toMatchObject({
      error: 'external failure',
      blockOutputs: { 'agent.text': 'external ok' },
    })
    expect(objects.readJson).toHaveBeenCalledWith({
      reference: {
        __simLargeValueRef: true,
        version: 1,
        id: 'lv_abcdefghijkl',
        kind: 'object',
        key: 'execution/workspace-1/workflow-1/execution-1/large-value-lv_abcdefghijkl.json',
        size: 4096,
        executionId: 'execution-1',
      },
      workspaceId: 'workspace-1',
      workflowId: 'workflow-1',
      executionId: 'execution-1',
    })

    deps.executions.read.mockResolvedValue({
      execution: {
        ...current.execution,
        status: 'completed',
        executionData: {
          traceStoreRef: {
            __simLargeValueRef: true,
            version: 1,
            id: 'lv_abcdefghijkl',
            kind: 'object',
            key: 'execution/workspace-1/workflow-1/execution-1/large-value-lv_abcdefghijkl.json',
            size: 4096,
            executionId: 'execution-1',
          },
        },
      },
      paused: null,
    })
    const completed = await app.handle(
      new Request(
        'http://api.test/api/workflows/workflow-1/executions/execution-1?includeOutput=true&selectedOutputs=agent.text',
        { headers: { cookie: 'session=valid' } }
      )
    )
    expect(completed.status).toBe(200)
    expect(await completed.json()).toMatchObject({
      finalOutput: { answer: 84 },
      blockOutputs: { 'agent.text': 'external ok' },
    })
  })

  it('degrades safely when an external execution object is missing', async () => {
    const objects = { readJson: vi.fn(async () => null) }
    const deps = {
      ...dependencies(),
      payloads: createObjectStoreExecutionPayloadMaterializer(objects),
    }
    const current = await deps.executions.read('workflow-1', 'execution-1')
    if (!current) throw new Error('Execution fixture is unavailable')
    deps.executions.read.mockResolvedValue({
      execution: {
        ...current.execution,
        status: 'failed',
        executionData: {
          traceStoreRef: {
            __simLargeValueRef: true,
            version: 1,
            id: 'lv_abcdefghijkl',
            kind: 'object',
            key: 'execution/workspace-1/workflow-1/execution-1/large-value-lv_abcdefghijkl.json',
            size: 1024,
            executionId: 'execution-1',
          },
        },
      },
      paused: null,
    })
    const app = createApiApplication({ executionControl: createExecutionControlModule(deps) })
    const failed = await app.handle(
      new Request(
        'http://api.test/api/workflows/workflow-1/executions/execution-1?selectedOutputs=agent.text',
        { headers: { cookie: 'session=valid' } }
      )
    )
    expect(failed.status).toBe(200)
    expect(await failed.json()).toMatchObject({
      error: null,
      blockOutputs: {},
    })

    deps.executions.read.mockResolvedValue({
      execution: {
        ...current.execution,
        executionData: {
          traceStoreRef: {
            __simLargeValueRef: true,
            version: 1,
            id: 'lv_abcdefghijkl',
            kind: 'object',
            key: 'execution/workspace-1/workflow-1/execution-1/large-value-lv_abcdefghijkl.json',
            size: 1024,
            executionId: 'execution-1',
          },
        },
      },
      paused: null,
    })
    const completed = await app.handle(
      new Request(
        'http://api.test/api/workflows/workflow-1/executions/execution-1?includeOutput=true&selectedOutputs=agent.text',
        { headers: { cookie: 'session=valid' } }
      )
    )
    expect(completed.status).toBe(200)
    expect(await completed.json()).toMatchObject({
      error: null,
      finalOutput: null,
      blockOutputs: {},
    })
  })

  it('fails closed when an externalized payload service is unavailable', async () => {
    const deps = {
      ...dependencies(),
      payloads: createObjectStoreExecutionPayloadMaterializer({
        async readJson() {
          throw new ExecutionPayloadUnavailableError('object service is not configured')
        },
      }),
    }
    const current = await deps.executions.read('workflow-1', 'execution-1')
    if (!current) throw new Error('Execution fixture is unavailable')
    deps.executions.read.mockResolvedValue({
      execution: {
        ...current.execution,
        executionData: {
          traceStoreRef: {
            __simLargeValueRef: true,
            version: 1,
            id: 'lv_abcdefghijkl',
            kind: 'object',
            key: 'execution/workspace-1/workflow-1/execution-1/large-value-lv_abcdefghijkl.json',
            size: 1024,
            executionId: 'execution-1',
          },
        },
      },
      paused: null,
    })
    const app = createApiApplication({ executionControl: createExecutionControlModule(deps) })
    const response = await app.handle(
      new Request(
        'http://api.test/api/workflows/workflow-1/executions/execution-1?includeOutput=true',
        { headers: { cookie: 'session=valid' } }
      )
    )
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: 'Execution payload service unavailable',
      requestId: expect.any(String),
    })
  })

  it('forwards cron polling as a Worker command and rejects other secrets', async () => {
    const deps = dependencies()
    const app = createApiApplication({ executionControl: createExecutionControlModule(deps) })
    const denied = await app.handle(new Request('http://api.test/api/resume/poll'))
    expect(denied.status).toBe(401)
    expect(deps.resumePoll.run).not.toHaveBeenCalled()
    const accepted = await app.handle(
      new Request('http://api.test/api/resume/poll', {
        headers: { authorization: 'Bearer cron-secret', 'x-request-id': 'poll-1' },
      })
    )
    expect(accepted.status).toBe(200)
    expect(deps.resumePoll.run).toHaveBeenCalledWith('poll-1')
  })

  it('preserves the donor 202 response when Worker skips an overlapping poll', async () => {
    const deps = dependencies()
    deps.resumePoll.run.mockResolvedValue({
      contractVersion: EXECUTION_CONTRACTS_VERSION,
      commandId: 'poll-overlap',
      status: 'skipped',
      claimedRows: 0,
      dispatched: 0,
      failures: [],
      message: 'Polling already in progress - skipped',
    })
    const app = createApiApplication({ executionControl: createExecutionControlModule(deps) })
    const response = await app.handle(
      new Request('http://api.test/api/resume/poll', {
        headers: {
          authorization: 'Bearer cron-secret',
          'x-request-id': 'poll-overlap',
        },
      })
    )
    expect(response.status).toBe(202)
    expect(await response.json()).toMatchObject({
      success: true,
      message: 'Polling already in progress - skipped',
    })
  })

  it.each(['POST', 'PUT', 'DELETE'])(
    'preserves GET-only method semantics for %s',
    async (method) => {
      const deps = dependencies()
      const app = createApiApplication({ executionControl: createExecutionControlModule(deps) })
      const response = await app.handle(new Request('http://api.test/api/jobs/job-1', { method }))
      expect(response.status).toBe(405)
      expect(deps.jobs.read).not.toHaveBeenCalled()
    }
  )
})

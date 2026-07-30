import type { PausedExecutionDetailV1, PausedExecutionSummaryV1 } from '@sim/api-contracts'
import type { AuthenticatedRequestContext } from '@sim/api-contracts/auth'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createGetPausedExecutionHandler,
  createGetPausedExecutionUseCase,
  createListPausedExecutionsHandler,
  createListPausedExecutionsUseCase,
  type PausedExecutionReader,
  projectPausedExecutionDetail,
  projectPausedExecutionSummary,
  type WorkflowReadAuthorizer,
} from '@/modules/execution/read'

const sessionContext: AuthenticatedRequestContext = {
  authContextVersion: 1,
  authenticationMethod: 'session',
  actor: { id: 'user-1', type: 'user' },
  requestId: 'auth-request-1',
  permissions: [],
  activeOrganizationId: null,
}

const publicContext: AuthenticatedRequestContext = {
  authContextVersion: 1,
  authenticationMethod: 'public-token',
  actor: { id: 'public-1', type: 'public' },
  requestId: 'auth-request-public',
  permissions: [],
  credentialId: 'credential-1',
  workspaceId: 'workspace-1',
  organizationId: null,
  resourceType: 'workflow',
  resourceId: 'workflow-1',
}

const detail: PausedExecutionDetailV1 = {
  id: 'paused-1',
  workflowId: 'workflow-1',
  executionId: 'execution-1',
  status: 'paused',
  totalPauseCount: 1,
  resumedCount: 0,
  pausedAt: '2026-07-30T00:00:00.000Z',
  updatedAt: '2026-07-30T00:01:00.000Z',
  expiresAt: null,
  metadata: {},
  triggerIds: ['trigger-1'],
  pausePoints: [
    {
      contextId: 'context-1',
      blockId: 'context-1',
      resumeStatus: 'paused',
      snapshotReady: false,
      pauseKind: 'human',
      queuePosition: null,
      latestResumeEntry: null,
    },
  ],
  executionSnapshot: {
    snapshot: '{"metadata":{"workflowId":"workflow-1"}}',
    triggerIds: ['trigger-1'],
  },
  queue: [],
}

const summary: PausedExecutionSummaryV1 = {
  id: detail.id,
  workflowId: detail.workflowId,
  executionId: detail.executionId,
  status: detail.status,
  totalPauseCount: detail.totalPauseCount,
  resumedCount: detail.resumedCount,
  pausedAt: detail.pausedAt,
  updatedAt: detail.updatedAt,
  expiresAt: detail.expiresAt,
  metadata: detail.metadata,
  triggerIds: detail.triggerIds,
  pausePoints: detail.pausePoints,
}

function createDependencies() {
  const authorize = vi.fn<WorkflowReadAuthorizer['authorize']>()
  const readDetail = vi.fn<PausedExecutionReader['readDetail']>()
  const list = vi.fn<PausedExecutionReader['list']>()
  const authorizer: WorkflowReadAuthorizer = { authorize }
  const reader: PausedExecutionReader = { readDetail, list }
  authorize.mockResolvedValue({ allowed: true, workspaceId: 'workspace-1' })
  readDetail.mockResolvedValue(detail)
  list.mockResolvedValue([summary])
  return { authorize, readDetail, list, authorizer, reader }
}

describe('paused execution projection', () => {
  it('filters time pauses and enriches human pauses from the resume queue', () => {
    const projected = projectPausedExecutionDetail(
      {
        id: 'paused-1',
        workflowId: 'workflow-1',
        executionId: 'execution-1',
        status: 'paused',
        pausePoints: {
          human: {
            contextId: 'context-1',
            blockId: 'approval_loop12',
            pauseKind: 'human',
            resumeStatus: 'paused',
            resumeLinks: {
              apiUrl: '/api/resume/workflow-1/execution-1/context-1',
              uiUrl: 'https://example.test/resume?token=secret',
              contextId: 'context-1',
              executionId: 'execution-1',
              workflowId: 'workflow-1',
              credentialId: 'must-not-leak',
            },
            parallelScope: {
              parallelId: 'parallel-1',
              branchIndex: 0,
              branchTotal: 2,
              internalCursor: 'must-not-leak',
            },
            loopScope: {
              loopId: 'loop-1',
              iteration: 3,
              internalCursor: 'must-not-leak',
            },
            decryptedCredential: 'must-not-leak',
          },
          time: {
            contextId: 'time-1',
            pauseKind: 'time',
            resumeStatus: 'paused',
          },
          resumed: {
            contextId: 'context-2',
            pauseKind: 'human',
            resumeStatus: 'resumed',
          },
        },
        metadata: { source: 'manual' },
        pausedAt: new Date('2026-07-30T00:00:00.000Z'),
        updatedAt: new Date('2026-07-30T00:01:00.000Z'),
        expiresAt: null,
        executionSnapshot: {
          snapshot: '{"metadata":{"workflowId":"workflow-1"}}',
          triggerIds: ['trigger-1'],
          encryptionKey: 'must-not-leak',
        },
      },
      [
        {
          id: 'queue-1',
          pausedExecutionId: 'paused-1',
          parentExecutionId: 'execution-1',
          newExecutionId: 'execution-2',
          contextId: 'context-1',
          resumeInput: { approved: true },
          status: 'pending',
          queuedAt: new Date('2026-07-30T00:02:00.000Z'),
          claimedAt: null,
          completedAt: null,
          failureReason: null,
        },
        {
          id: 'queue-2',
          pausedExecutionId: 'paused-1',
          parentExecutionId: 'execution-1',
          newExecutionId: 'execution-3',
          contextId: 'context-1',
          resumeInput: null,
          status: 'failed',
          queuedAt: new Date('2026-07-30T00:03:00.000Z'),
          claimedAt: null,
          completedAt: new Date('2026-07-30T00:04:00.000Z'),
          failureReason: 'failed',
        },
      ]
    )

    expect(projected?.pausePoints).toHaveLength(2)
    expect(projected?.totalPauseCount).toBe(2)
    expect(projected?.resumedCount).toBe(1)
    expect(projected?.triggerIds).toEqual(['trigger-1'])
    expect(projected?.pausePoints[0]).toMatchObject({
      blockId: 'approval',
      queuePosition: 1,
      latestResumeEntry: { id: 'queue-2' },
      resumeLinks: { uiUrl: 'https://example.test/resume' },
      parallelScope: { parallelId: 'parallel-1', branchIndex: 0, branchTotal: 2 },
      loopScope: { loopId: 'loop-1', iteration: 3 },
    })
    expect(JSON.stringify(projected)).not.toContain('decryptedCredential')
    expect(JSON.stringify(projected)).not.toContain('credentialId')
    expect(JSON.stringify(projected)).not.toContain('internalCursor')
    expect(JSON.stringify(projected)).not.toContain('encryptionKey')
  })

  it('preserves valid dynamic JSON while rejecting malformed historical snapshots', () => {
    const base = {
      id: 'paused-1',
      workflowId: 'workflow-1',
      executionId: 'execution-1',
      status: 'paused',
      pausePoints: { human: { contextId: 'context-1' } },
      metadata: {},
      pausedAt: new Date('2026-07-30T00:00:00.000Z'),
      updatedAt: new Date('2026-07-30T00:01:00.000Z'),
      expiresAt: null,
    }
    const projected = projectPausedExecutionDetail(
      {
        ...base,
        executionSnapshot: {
          snapshot: '{"workflow":{"blocks":[]}}',
          triggerIds: [],
        },
      },
      [
        {
          id: 'queue-json',
          pausedExecutionId: 'paused-1',
          parentExecutionId: 'execution-1',
          newExecutionId: 'execution-2',
          contextId: 'context-1',
          resumeInput: { scalar: 1, array: [true, null], nested: { value: 'ok' } },
          status: 'pending',
          queuedAt: null,
          claimedAt: null,
          completedAt: null,
          failureReason: null,
        },
      ]
    )
    expect(projected?.queue[0]?.resumeInput).toEqual({
      scalar: 1,
      array: [true, null],
      nested: { value: 'ok' },
    })

    expect(() =>
      projectPausedExecutionDetail({ ...base, executionSnapshot: { triggerIds: [] } }, [])
    ).toThrow()
  })

  it('hides time-only paused rows and reads trigger ids from a narrow list projection', () => {
    expect(
      projectPausedExecutionSummary({
        id: 'paused-time',
        workflowId: 'workflow-1',
        executionId: 'execution-time',
        status: 'paused',
        pausePoints: { time: { contextId: 'time-1', pauseKind: 'time' } },
        metadata: {},
        pausedAt: new Date(),
        updatedAt: new Date(),
        expiresAt: null,
        triggerIds: ['trigger-list'],
      })
    ).toBeNull()

    const summary = projectPausedExecutionSummary({
      id: 'paused-human',
      workflowId: 'workflow-1',
      executionId: 'execution-human',
      status: 'paused',
      pausePoints: { human: { contextId: 'human-1' } },
      metadata: {},
      pausedAt: new Date('2026-07-30T00:00:00.000Z'),
      updatedAt: new Date('2026-07-30T00:01:00.000Z'),
      expiresAt: null,
      triggerIds: ['trigger-list'],
    })
    expect(summary?.triggerIds).toEqual(['trigger-list'])
    expect(summary?.pausePoints[0]).toMatchObject({
      pauseKind: 'human',
      resumeStatus: 'paused',
      queuePosition: null,
      latestResumeEntry: null,
    })
  })
})

describe('paused execution use cases', () => {
  let dependencies: ReturnType<typeof createDependencies>

  beforeEach(() => {
    dependencies = createDependencies()
  })

  it('authorizes before reading one paused execution', async () => {
    const useCase = createGetPausedExecutionUseCase(dependencies)
    const result = await useCase.execute(sessionContext, {
      workflowId: 'workflow-1',
      executionId: 'execution-1',
    })

    expect(result).toEqual({ ok: true, value: detail })
    expect(dependencies.authorize).toHaveBeenCalledWith(sessionContext, 'workflow-1')
    expect(dependencies.readDetail).toHaveBeenCalledWith('workflow-1', 'execution-1')
  })

  it('does not read paused state when workflow authorization fails', async () => {
    dependencies.authorize.mockResolvedValue({
      allowed: false,
      status: 403,
      message: 'Access denied',
    })
    const useCase = createGetPausedExecutionUseCase(dependencies)
    const result = await useCase.execute(sessionContext, {
      workflowId: 'workflow-1',
      executionId: 'execution-1',
    })

    expect(result).toEqual({
      ok: false,
      reason: 'access-error',
      status: 403,
      message: 'Access denied',
    })
    expect(dependencies.readDetail).not.toHaveBeenCalled()
  })

  it('returns not-found for a missing or time-only projection', async () => {
    dependencies.readDetail.mockResolvedValue(null)
    const result = await createGetPausedExecutionUseCase(dependencies).execute(sessionContext, {
      workflowId: 'workflow-1',
      executionId: 'execution-1',
    })
    expect(result).toEqual({ ok: false, reason: 'not-found' })
  })

  it('preserves donor comma-separated status filtering', async () => {
    const result = await createListPausedExecutionsUseCase(dependencies).execute(sessionContext, {
      workflowId: 'workflow-1',
      status: 'paused, partially_resumed',
    })
    expect(result.ok).toBe(true)
    expect(dependencies.list).toHaveBeenCalledWith('workflow-1', {
      statuses: ['paused', 'partially_resumed'],
    })
  })

  it('treats an empty status as no filter', async () => {
    await createListPausedExecutionsUseCase(dependencies).execute(sessionContext, {
      workflowId: 'workflow-1',
      status: '',
    })
    expect(dependencies.list).toHaveBeenCalledWith('workflow-1', { statuses: undefined })
  })
})

describe('paused execution handlers', () => {
  let dependencies: ReturnType<typeof createDependencies>

  beforeEach(() => {
    dependencies = createDependencies()
  })

  it('rejects missing and public-token identities before parsing the route', async () => {
    const handler = createGetPausedExecutionHandler(createGetPausedExecutionUseCase(dependencies))
    const request = new Request('http://localhost/api/resume/workflow-1/execution-1')
    expect(
      (
        await handler({
          request,
          requestId: 'request-1',
        })
      ).status
    ).toBe(401)
    expect(
      (
        await handler({
          request,
          authenticationContext: publicContext,
          requestId: 'request-2',
        })
      ).status
    ).toBe(401)
    expect(dependencies.authorize).not.toHaveBeenCalled()
  })

  it.each(['/api/resume/workflow-1/execution-1', '/api/workflows/workflow-1/paused/execution-1'])(
    'serves the shared paused detail use case through %s',
    async (pathname) => {
      const response = await createGetPausedExecutionHandler(
        createGetPausedExecutionUseCase(dependencies)
      )({
        request: new Request(`http://localhost${pathname}`),
        authenticationContext: sessionContext,
        requestId: 'request-detail',
      })
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual(detail)
    }
  )

  it('maps missing paused detail to the donor 404 message', async () => {
    dependencies.readDetail.mockResolvedValue(null)
    const response = await createGetPausedExecutionHandler(
      createGetPausedExecutionUseCase(dependencies)
    )({
      request: new Request('http://localhost/api/resume/workflow-1/execution-1'),
      authenticationContext: sessionContext,
      requestId: 'request-not-found',
    })
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Paused execution not found' })
  })

  it('returns a safe 500 instead of leaking the donor resume alias error message', async () => {
    dependencies.readDetail.mockRejectedValue(new Error('postgres password leaked'))
    const response = await createGetPausedExecutionHandler(
      createGetPausedExecutionUseCase(dependencies)
    )({
      request: new Request('http://localhost/api/resume/workflow-1/execution-1'),
      authenticationContext: sessionContext,
      requestId: 'request-error',
    })
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: 'Internal server error',
      requestId: 'request-error',
    })
  })

  it('returns the paused list and forwards the status query', async () => {
    const response = await createListPausedExecutionsHandler(
      createListPausedExecutionsUseCase(dependencies)
    )({
      request: new Request(
        'http://localhost/api/workflows/workflow-1/paused?status=paused%2Cpartially_resumed'
      ),
      authenticationContext: sessionContext,
      requestId: 'request-list',
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ pausedExecutions: [summary] })
    expect(dependencies.list).toHaveBeenCalledWith('workflow-1', {
      statuses: ['paused', 'partially_resumed'],
    })
  })
})

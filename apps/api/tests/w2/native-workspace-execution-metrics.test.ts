import type { SessionRequestContext } from '@sim/api-contracts/auth'
import { workspaceExecutionMetricsResponseV1Schema } from '@sim/api-contracts/workspaces'
import type { RequestAccessResolver } from '@sim/auth/authorization'
import { createRequestAuthenticator } from '@sim/auth/request-context'
import { describe, expect, it, vi } from 'vitest'
import { createApiApplication } from '@/bootstrap/application/create-api-application'
import { createRoutedTenantReadBackend } from '@/modules/tenant-read/application/create-routed-tenant-read-backend'
import { createTenantReadModule } from '@/modules/tenant-read/application/create-tenant-read-module'
import {
  createGetWorkspaceExecutionMetricsHandler,
  createGetWorkspaceExecutionMetricsUseCase,
  type WorkspaceExecutionMetricsReadRepository,
} from '@/modules/workspaces'

const currentTime = new Date('2026-07-30T12:00:00.000Z')

const sessionContext: SessionRequestContext = {
  authContextVersion: 1,
  requestId: 'request-1058',
  authenticationMethod: 'session',
  actor: {
    id: 'viewer-1',
    type: 'user',
    name: 'Viewer',
    email: 'viewer@example.com',
  },
  credentialId: 'session-1',
  activeOrganizationId: 'wrong-active-organization',
  permissions: [],
}

function access(permission: 'read' | 'write' | 'admin' | null = 'read'): RequestAccessResolver {
  return {
    workspacePermission: vi.fn(async () => permission),
    organizationRole: vi.fn(async () => null),
    workflow: vi.fn(async () => null),
  }
}

function repository(
  options: {
    workflows?: Awaited<ReturnType<WorkspaceExecutionMetricsReadRepository['listWorkflows']>>
    bounds?: Awaited<ReturnType<WorkspaceExecutionMetricsReadRepository['readBounds']>>
    samples?: Awaited<ReturnType<WorkspaceExecutionMetricsReadRepository['listSamples']>>
  } = {}
): WorkspaceExecutionMetricsReadRepository {
  return {
    listWorkflows: vi.fn(async () => options.workflows ?? [{ id: 'workflow-1', name: 'Release' }]),
    readBounds: vi.fn(
      async () =>
        options.bounds ?? {
          minDate: new Date('2026-07-30T10:00:00.000Z'),
          maxDate: new Date('2026-07-30T11:00:00.000Z'),
        }
    ),
    listSamples: vi.fn(async () => options.samples ?? []),
  }
}

function handler(
  options: {
    access?: RequestAccessResolver
    repository?: WorkspaceExecutionMetricsReadRepository
  } = {}
) {
  return createGetWorkspaceExecutionMetricsHandler(
    createGetWorkspaceExecutionMetricsUseCase({
      access: options.access ?? access(),
      repository: options.repository ?? repository(),
      now: () => currentTime,
    })
  )
}

function request(query = '') {
  return new Request(`http://api.test/api/workspaces/workspace-1/metrics/executions${query}`)
}

describe('native workspace execution metrics read', () => {
  it('projects bucket counts, success, average, and donor percentiles', async () => {
    const source = repository({
      samples: [
        {
          workflowId: 'workflow-1',
          level: 'error',
          startedAt: new Date('2026-07-30T10:10:00.000Z'),
          totalDurationMs: 100,
        },
        {
          workflowId: 'workflow-1',
          level: 'info',
          startedAt: new Date('2026-07-30T10:20:00.000Z'),
          totalDurationMs: 200,
        },
        {
          workflowId: 'workflow-1',
          level: 'info',
          startedAt: new Date('2026-07-30T11:10:00.000Z'),
          totalDurationMs: 400,
        },
      ],
    })
    const response = await handler({ repository: source })({
      request: request(
        '?startTime=2026-07-30T10%3A00%3A00.000Z&endTime=2026-07-30T12%3A00%3A00.000Z&segments=2&workflowIds=workflow-1&folderIds=folder-1&triggers=manual&level=error%2Cinfo'
      ),
      authenticationContext: sessionContext,
      requestId: 'request-1058',
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(workspaceExecutionMetricsResponseV1Schema.parse(body)).toEqual(body)
    expect(body).toEqual({
      workflows: [
        {
          workflowId: 'workflow-1',
          workflowName: 'Release',
          segments: [
            {
              timestamp: '2026-07-30T10:00:00.000Z',
              totalExecutions: 2,
              successfulExecutions: 1,
              avgDurationMs: 150,
              p50Ms: 100,
              p90Ms: 100,
              p99Ms: 100,
            },
            {
              timestamp: '2026-07-30T11:00:00.000Z',
              totalExecutions: 1,
              successfulExecutions: 1,
              avgDurationMs: 400,
              p50Ms: 400,
              p90Ms: 400,
              p99Ms: 400,
            },
          ],
        },
      ],
      startTime: '2026-07-30T10:00:00.000Z',
      endTime: '2026-07-30T12:00:00.000Z',
      segmentMs: 3_600_000,
    })
    expect(source.listWorkflows).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      workflowIds: ['workflow-1'],
      folderIds: ['folder-1'],
    })
    expect(source.listSamples).toHaveBeenCalledWith({
      workflowIds: ['workflow-1'],
      triggers: ['manual'],
      levels: ['error', 'info'],
      start: new Date('2026-07-30T10:00:00.000Z'),
      end: new Date('2026-07-30T12:00:00.000Z'),
    })
  })

  it('returns the donor default range before querying logs when no workflows match', async () => {
    const source = repository({ workflows: [] })
    const response = await handler({ repository: source })({
      request: request(),
      authenticationContext: sessionContext,
      requestId: 'request-1058',
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      workflows: [],
      startTime: '2026-07-29T12:00:00.000Z',
      endTime: '2026-07-30T12:00:00.000Z',
      segmentMs: 0,
    })
    expect(source.readBounds).not.toHaveBeenCalled()
    expect(source.listSamples).not.toHaveBeenCalled()
  })

  it('uses filtered all-time bounds and expands their end to now', async () => {
    const source = repository({
      samples: [
        {
          workflowId: 'workflow-1',
          level: 'info',
          startedAt: new Date('2026-07-30T11:00:00.000Z'),
          totalDurationMs: null,
        },
      ],
    })
    const response = await handler({ repository: source })({
      request: request('?allTime=true&segments=2&triggers=cron&level=pending'),
      authenticationContext: sessionContext,
      requestId: 'request-1058',
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      startTime: '2026-07-30T10:00:00.000Z',
      endTime: '2026-07-30T12:00:00.000Z',
      segmentMs: 3_600_000,
    })
    expect(source.readBounds).toHaveBeenCalledWith({
      workflowIds: ['workflow-1'],
      triggers: ['cron'],
      levels: ['pending'],
    })
  })

  it('returns empty workflow segments when all-time filters have no logs', async () => {
    const source = repository({ bounds: { minDate: null, maxDate: null } })
    const response = await handler({ repository: source })({
      request: request('?allTime=true'),
      authenticationContext: sessionContext,
      requestId: 'request-1058',
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      workflows: [{ workflowId: 'workflow-1', workflowName: 'Release', segments: [] }],
      startTime: '2026-07-30T12:00:00.000Z',
      endTime: '2026-07-30T12:00:00.000Z',
      segmentMs: 0,
    })
    expect(source.listSamples).not.toHaveBeenCalled()
  })

  it('preserves session, invalid-time, and workspace-access failures', async () => {
    const unauthorized = await handler()({
      request: request(),
      requestId: 'request-1058',
    })
    expect(unauthorized.status).toBe(401)
    expect(await unauthorized.json()).toEqual({ error: 'Unauthorized' })

    const deniedAccess = access()
    const invalid = await handler({ access: deniedAccess })({
      request: request('?startTime=not-a-date'),
      authenticationContext: sessionContext,
      requestId: 'request-1058',
    })
    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toEqual({ error: 'Invalid time range' })
    expect(deniedAccess.workspacePermission).not.toHaveBeenCalled()

    const reversed = await handler()({
      request: request(
        '?startTime=2026-07-30T12%3A00%3A00.000Z&endTime=2026-07-30T11%3A00%3A00.000Z'
      ),
      authenticationContext: sessionContext,
      requestId: 'request-1058',
    })
    expect(reversed.status).toBe(400)
    expect(await reversed.json()).toEqual({ error: 'Invalid time range' })

    const denied = await handler({ access: access(null) })({
      request: request(),
      authenticationContext: sessionContext,
      requestId: 'request-1058',
    })
    expect(denied.status).toBe(403)
    expect(await denied.json()).toEqual({ error: 'Forbidden' })
  })

  it('keeps unknown levels unfiltered and empty comma filters explicit', async () => {
    const source = repository()
    const response = await handler({ repository: source })({
      request: request('?triggers=%2C&level=unknown'),
      authenticationContext: sessionContext,
      requestId: 'request-1058',
    })

    expect(response.status).toBe(200)
    expect(source.listSamples).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowIds: ['workflow-1'],
        triggers: [],
      })
    )
    expect(source.listSamples).not.toHaveBeenCalledWith(
      expect.objectContaining({ levels: expect.anything() })
    )
  })

  it('preserves the donor generic 500 for schema and repository failures', async () => {
    const invalid = await handler()({
      request: request('?segments=201'),
      authenticationContext: sessionContext,
      requestId: 'request-1058',
    })
    expect(invalid.status).toBe(500)
    expect(await invalid.json()).toEqual({ error: 'Failed to compute metrics' })

    const fractional = await handler({
      repository: repository({
        samples: [
          {
            workflowId: 'workflow-1',
            level: 'info',
            startedAt: new Date('2026-07-30T12:00:00.000Z'),
            totalDurationMs: 1,
          },
        ],
      }),
    })({
      request: request(
        '?startTime=2026-07-30T10%3A00%3A00.000Z&endTime=2026-07-30T12%3A00%3A00.000Z&segments=1.5'
      ),
      authenticationContext: sessionContext,
      requestId: 'request-1058',
    })
    expect(fractional.status).toBe(500)
    expect(await fractional.json()).toEqual({ error: 'Failed to compute metrics' })

    const failed = await handler({
      repository: {
        async listWorkflows() {
          throw new Error('replica unavailable')
        },
        async readBounds() {
          return { minDate: null, maxDate: null }
        },
        async listSamples() {
          return []
        },
      },
    })({
      request: request(),
      authenticationContext: sessionContext,
      requestId: 'request-1058',
    })
    expect(failed.status).toBe(500)
    expect(await failed.json()).toEqual({ error: 'Failed to compute metrics' })
  })

  it('executes through session authentication and API-1058 native routing', async () => {
    const authentication = createRequestAuthenticator({
      sessions: {
        async verify(headers) {
          return headers.get('cookie') === 'session=valid'
            ? {
                verified: true,
                credential: {
                  actor: sessionContext.actor,
                  sessionId: sessionContext.credentialId,
                  activeOrganizationId: sessionContext.activeOrganizationId,
                },
              }
            : { verified: false, reason: 'invalid' }
        },
      },
    })
    const application = createApiApplication({
      tenantRead: createTenantReadModule({
        authentication,
        backend: createRoutedTenantReadBackend({
          fallback: {
            async forward() {
              throw new Error('must not use legacy')
            },
          },
          nativeHandlers: { 'API-1058': handler({ repository: repository({ workflows: [] }) }) },
        }),
      }),
    })

    const response = await application.handle(
      new Request('http://api.test/api/workspaces/workspace-1/metrics/executions', {
        headers: { cookie: 'session=valid', 'x-request-id': 'request-1058' },
      })
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('x-sim-api-backend')).toBe('native')
    expect(response.headers.get('x-sim-api-inventory-id')).toBe('API-1058')
  })
})

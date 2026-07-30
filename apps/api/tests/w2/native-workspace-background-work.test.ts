import type { SessionRequestContext } from '@sim/api-contracts/auth'
import { listWorkspaceBackgroundWorkResponseV1Schema } from '@sim/api-contracts/workspace-background-work'
import { createRequestAuthenticator } from '@sim/auth/request-context'
import { describe, expect, it, vi } from 'vitest'
import { createApiApplication } from '@/bootstrap/application/create-api-application'
import type { ForkingRuntimeConfig } from '@/config/forking-runtime'
import { createRoutedTenantReadBackend } from '@/modules/tenant-read/application/create-routed-tenant-read-backend'
import { createTenantReadModule } from '@/modules/tenant-read/application/create-tenant-read-module'
import { createListWorkspaceBackgroundWorkUseCase } from '@/modules/workspace-forking/application/list-workspace-background-work'
import { createListWorkspaceBackgroundWorkHandler } from '@/modules/workspace-forking/interface/create-list-workspace-background-work-handler'
import type { ForkEntitlementReader } from '@/modules/workspace-forking/ports/fork-entitlement-reader'
import type { ForkRolloutReader } from '@/modules/workspace-forking/ports/fork-rollout-reader'
import type {
  WorkspaceBackgroundWorkPage,
  WorkspaceBackgroundWorkReader,
} from '@/modules/workspace-forking/ports/workspace-background-work-reader'
import type { WorkspaceForkCurrentAccessReader } from '@/modules/workspace-forking/ports/workspace-fork-current-access-reader'

const sessionContext: SessionRequestContext = {
  activeOrganizationId: 'unrelated-organization',
  actor: {
    email: 'viewer@example.com',
    id: 'viewer-1',
    name: 'Viewer',
    type: 'user',
  },
  authenticationMethod: 'session',
  authContextVersion: 1,
  credentialId: 'session-1',
  permissions: [],
  requestId: 'request-1009',
}

const selfHostedRuntime: ForkingRuntimeConfig = {
  accessControlEnabled: false,
  appConfig: { enabled: false },
  billingEnabled: false,
  forkingEnabled: true,
  hosted: false,
}

const hostedRuntime: ForkingRuntimeConfig = {
  accessControlEnabled: false,
  appConfig: {
    application: 'sim',
    enabled: true,
    environment: 'production',
    region: 'us-east-1',
  },
  billingEnabled: true,
  forkingEnabled: false,
  hosted: true,
}

function currentAccess(
  permission: 'read' | 'write' | 'admin' | null = 'admin'
): WorkspaceForkCurrentAccessReader {
  return {
    findActiveForViewer: vi.fn(async (workspaceId) =>
      workspaceId === 'workspace-missing' ? null : { organizationId: 'organization-1', permission }
    ),
  }
}

function reader(): WorkspaceBackgroundWorkReader {
  return {
    listInvolving: vi.fn(async () => {
      const page: WorkspaceBackgroundWorkPage = {
        nextCursor: 'next-page',
        records: [
          {
            completedAt: new Date('2026-07-30T00:00:03.000Z'),
            error: null,
            id: 'work-1',
            kind: 'fork_sync',
            message: 'Synced',
            metadata: {
              actorName: 'Ada',
              otherWorkspaceId: 'workspace-2',
              secretToken: 'must-not-leak',
              updated: 2,
            },
            startedAt: new Date('2026-07-30T00:00:00.000Z'),
            status: 'completed',
            workflowId: null,
            workspaceId: 'workspace-1',
          },
        ],
      }
      return page
    }),
  }
}

function entitlement(allowed = true): ForkEntitlementReader {
  return { isEntitled: vi.fn(async () => allowed) }
}

function rollout(enabled = true): ForkRolloutReader {
  return { isEnabled: vi.fn(async () => enabled) }
}

function handler(
  options: {
    currentAccess?: WorkspaceForkCurrentAccessReader
    entitlement?: ForkEntitlementReader
    reader?: WorkspaceBackgroundWorkReader
    rollout?: ForkRolloutReader
    runtime?: ForkingRuntimeConfig
  } = {}
) {
  return createListWorkspaceBackgroundWorkHandler(
    createListWorkspaceBackgroundWorkUseCase({
      currentAccess: options.currentAccess ?? currentAccess(),
      entitlement: options.entitlement ?? entitlement(),
      reader: options.reader ?? reader(),
      rollout: options.rollout ?? rollout(),
      runtime: options.runtime ?? selfHostedRuntime,
    })
  )
}

function request(workspaceId = 'workspace-1', query = ''): Request {
  return new Request(`http://api.test/api/workspaces/${workspaceId}/background-work${query}`)
}

describe('native workspace background work', () => {
  it('returns the versioned response and strips unknown metadata fields', async () => {
    const response = await handler()({
      authenticationContext: sessionContext,
      request: request(),
      requestId: 'request-1009',
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(listWorkspaceBackgroundWorkResponseV1Schema.parse(body)).toEqual(body)
    expect(body).toEqual({
      items: [
        {
          completedAt: '2026-07-30T00:00:03.000Z',
          error: null,
          id: 'work-1',
          kind: 'fork_sync',
          message: 'Synced',
          metadata: {
            actorName: 'Ada',
            otherWorkspaceId: 'workspace-2',
            updated: 2,
          },
          startedAt: '2026-07-30T00:00:00.000Z',
          status: 'completed',
          workflowId: null,
          workspaceId: 'workspace-1',
        },
      ],
      nextCursor: 'next-page',
    })
    expect(JSON.stringify(body)).not.toContain('must-not-leak')
  })

  it('authenticates before parsing or persistence access', async () => {
    const access = currentAccess()
    const backgroundWork = reader()
    const response = await handler({ currentAccess: access, reader: backgroundWork })({
      request: request('%E0%A4%A'),
      requestId: 'request-1009',
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(access.findActiveForViewer).not.toHaveBeenCalled()
    expect(backgroundWork.listInvolving).not.toHaveBeenCalled()
  })

  it('validates the workspace id before access and preserves donor limit coercion', async () => {
    const access = currentAccess()
    const invalid = await handler({ currentAccess: access })({
      authenticationContext: sessionContext,
      request: request('%E0%A4%A'),
      requestId: 'request-1009',
    })
    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toMatchObject({ error: 'Validation error' })
    expect(access.findActiveForViewer).not.toHaveBeenCalled()

    const backgroundWork = reader()
    await handler({ reader: backgroundWork })({
      authenticationContext: sessionContext,
      request: request('workspace-1', '?cursor=cursor-1&limit=5000'),
      requestId: 'request-1009',
    })
    expect(backgroundWork.listInvolving).toHaveBeenCalledWith({
      cursor: 'cursor-1',
      limit: 100,
      workspaceId: 'workspace-1',
    })
  })

  it('preserves workspace-not-found and request-id error shape', async () => {
    const backgroundWork = reader()
    const response = await handler({ reader: backgroundWork })({
      authenticationContext: sessionContext,
      request: request('workspace-missing'),
      requestId: 'request-1009',
    })

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: 'Workspace not found',
      requestId: 'request-1009',
    })
    expect(backgroundWork.listInvolving).not.toHaveBeenCalled()
  })

  it('checks deployment, Enterprise, and AppConfig gates before admin', async () => {
    const backgroundWork = reader()
    const deploymentDisabled = await handler({
      currentAccess: currentAccess('read'),
      reader: backgroundWork,
      runtime: { ...selfHostedRuntime, forkingEnabled: false },
    })({
      authenticationContext: sessionContext,
      request: request(),
      requestId: 'request-1009',
    })
    expect(deploymentDisabled.status).toBe(404)
    expect(await deploymentDisabled.json()).toEqual({
      error: 'Workspace forking is not enabled on this deployment',
      requestId: 'request-1009',
    })

    const enterpriseRequired = await handler({
      currentAccess: currentAccess('read'),
      entitlement: entitlement(false),
      reader: backgroundWork,
      runtime: hostedRuntime,
    })({
      authenticationContext: sessionContext,
      request: request(),
      requestId: 'request-1009',
    })
    expect(enterpriseRequired.status).toBe(403)
    expect(await enterpriseRequired.json()).toEqual({
      error: 'Workspace forking is available on Enterprise plans only',
      requestId: 'request-1009',
    })

    const rolloutDisabled = await handler({
      currentAccess: currentAccess('read'),
      reader: backgroundWork,
      rollout: rollout(false),
      runtime: hostedRuntime,
    })({
      authenticationContext: sessionContext,
      request: request(),
      requestId: 'request-1009',
    })
    expect(rolloutDisabled.status).toBe(404)
    expect(backgroundWork.listInvolving).not.toHaveBeenCalled()
  })

  it('requires admin only after the shared gate passes', async () => {
    const backgroundWork = reader()
    const response = await handler({
      currentAccess: currentAccess('write'),
      reader: backgroundWork,
    })({
      authenticationContext: sessionContext,
      request: request(),
      requestId: 'request-1009',
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: 'Admin access is required for this workspace',
      requestId: 'request-1009',
    })
    expect(backgroundWork.listInvolving).not.toHaveBeenCalled()
  })

  it('maps repository or response-contract failures to request-id 500s', async () => {
    const response = await handler({
      reader: {
        async listInvolving() {
          throw new Error('database unavailable')
        },
      },
    })({
      authenticationContext: sessionContext,
      request: request(),
      requestId: 'request-1009',
    })

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: 'Internal server error',
      requestId: 'request-1009',
    })
  })

  it('executes through session authentication and API-1009 native routing', async () => {
    const authentication = createRequestAuthenticator({
      sessions: {
        async verify(headers) {
          return headers.get('cookie') === 'session=valid'
            ? {
                credential: {
                  activeOrganizationId: sessionContext.activeOrganizationId,
                  actor: sessionContext.actor,
                  sessionId: sessionContext.credentialId,
                },
                verified: true,
              }
            : { reason: 'invalid', verified: false }
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
          nativeHandlers: { 'API-1009': handler() },
        }),
      }),
    })

    const response = await application.handle(
      new Request('http://api.test/api/workspaces/workspace-1/background-work', {
        headers: {
          cookie: 'session=valid',
          'x-request-id': 'request-1009',
        },
      })
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('x-sim-api-backend')).toBe('native')
    expect(response.headers.get('x-sim-api-inventory-id')).toBe('API-1009')
  })
})

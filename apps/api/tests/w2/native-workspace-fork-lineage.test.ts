import type { SessionRequestContext } from '@sim/api-contracts/auth'
import { getForkLineageResponseV1Schema } from '@sim/api-contracts/workspace-forking'
import { createRequestAuthenticator } from '@sim/auth/request-context'
import { describe, expect, it, vi } from 'vitest'
import { createApiApplication } from '@/bootstrap/application/create-api-application'
import type { ForkingRuntimeConfig } from '@/config/forking-runtime'
import { createRoutedTenantReadBackend } from '@/modules/tenant-read/application/create-routed-tenant-read-backend'
import { createTenantReadModule } from '@/modules/tenant-read/application/create-tenant-read-module'
import {
  createGetForkLineageHandler,
  createGetForkLineageUseCase,
  type ForkEntitlementReader,
  type ForkRolloutReader,
  type WorkspaceForkCurrentAccessReader,
  type WorkspaceForkLineageReader,
  type WorkspaceForkLineageSnapshot,
} from '@/modules/workspace-forking'

const sessionContext: SessionRequestContext = {
  authContextVersion: 1,
  requestId: 'request-1034',
  authenticationMethod: 'session',
  actor: {
    id: 'viewer-1',
    type: 'user',
    name: 'Viewer',
    email: 'viewer@example.com',
  },
  credentialId: 'session-1',
  activeOrganizationId: 'unrelated-organization',
  permissions: [],
}

const selfHostedRuntime: ForkingRuntimeConfig = {
  billingEnabled: false,
  forkingEnabled: true,
  accessControlEnabled: false,
  hosted: false,
  appConfig: { enabled: false },
}

const hostedRuntime: ForkingRuntimeConfig = {
  billingEnabled: true,
  forkingEnabled: false,
  accessControlEnabled: false,
  hosted: true,
  appConfig: {
    enabled: true,
    application: 'sim',
    environment: 'production',
  },
}

function currentAccess(
  permission: 'read' | 'write' | 'admin' | null = 'admin',
  organizationId: string | null = 'organization-1'
): WorkspaceForkCurrentAccessReader {
  return {
    findActiveForViewer: vi.fn(async (workspaceId) =>
      workspaceId === 'workspace-missing'
        ? null
        : {
            organizationId,
            permission,
          }
    ),
  }
}

function lineage(): WorkspaceForkLineageReader {
  return {
    readForViewer: vi.fn(
      async () =>
        ({
          parent: {
            id: 'workspace-parent',
            name: 'Parent',
            organizationId: 'organization-parent',
            viewerAccessible: true,
          },
          children: [
            {
              id: 'workspace-child-new',
              name: 'New child',
              organizationId: 'organization-child',
              viewerAccessible: false,
              createdAt: '2026-07-30T09:00:00.000Z',
            },
            {
              id: 'workspace-child-old',
              name: 'Old child',
              organizationId: null,
              viewerAccessible: true,
              createdAt: '2026-07-29T09:00:00.000Z',
            },
          ],
          undoableRun: {
            otherWorkspaceId: 'workspace-source',
            otherName: 'Archived source',
            direction: 'pull',
          },
        }) satisfies WorkspaceForkLineageSnapshot
    ),
  }
}

function entitlement(entitled = true): ForkEntitlementReader {
  return { isEntitled: vi.fn(async () => entitled) }
}

function rollout(enabled = true): ForkRolloutReader {
  return { isEnabled: vi.fn(async () => enabled) }
}

function handler(
  options: {
    currentAccess?: WorkspaceForkCurrentAccessReader
    lineage?: WorkspaceForkLineageReader
    entitlement?: ForkEntitlementReader
    rollout?: ForkRolloutReader
    runtime?: ForkingRuntimeConfig
  } = {}
) {
  return createGetForkLineageHandler(
    createGetForkLineageUseCase({
      currentAccess: options.currentAccess ?? currentAccess(),
      lineage: options.lineage ?? lineage(),
      entitlement: options.entitlement ?? entitlement(),
      rollout: options.rollout ?? rollout(),
      runtime: options.runtime ?? selfHostedRuntime,
    })
  )
}

function request(workspaceId = 'workspace-1') {
  return new Request(`http://api.test/api/workspaces/${workspaceId}/fork/lineage`)
}

describe('native workspace fork lineage', () => {
  it('returns the stable viewer-specific lineage contract', async () => {
    const response = await handler()({
      request: request(),
      authenticationContext: sessionContext,
      requestId: 'request-1034',
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(getForkLineageResponseV1Schema.parse(body)).toEqual(body)
    expect(body).toEqual({
      workspaceId: 'workspace-1',
      parent: {
        id: 'workspace-parent',
        name: 'Parent',
        organizationId: 'organization-parent',
        viewerAccessible: true,
      },
      children: [
        {
          id: 'workspace-child-new',
          name: 'New child',
          organizationId: 'organization-child',
          viewerAccessible: false,
          createdAt: '2026-07-30T09:00:00.000Z',
        },
        {
          id: 'workspace-child-old',
          name: 'Old child',
          organizationId: null,
          viewerAccessible: true,
          createdAt: '2026-07-29T09:00:00.000Z',
        },
      ],
      undoableRun: {
        otherWorkspaceId: 'workspace-source',
        otherName: 'Archived source',
        direction: 'pull',
      },
    })
  })

  it('authenticates before parsing or persistence access', async () => {
    const access = currentAccess()
    const response = await handler({ currentAccess: access })({
      request: request('%E0%A4%A'),
      requestId: 'request-1034',
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(access.findActiveForViewer).not.toHaveBeenCalled()
  })

  it('preserves workspace-not-found and validation responses', async () => {
    const missing = await handler()({
      request: request('workspace-missing'),
      authenticationContext: sessionContext,
      requestId: 'request-1034',
    })
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({ error: 'Workspace not found' })

    const invalid = await handler()({
      request: request('%E0%A4%A'),
      authenticationContext: sessionContext,
      requestId: 'request-1034',
    })
    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toMatchObject({ error: 'Validation error' })
  })

  it('checks deployment and Enterprise gates before admin permission', async () => {
    const projection = lineage()
    const deploymentDisabled = await handler({
      currentAccess: currentAccess('read'),
      lineage: projection,
      runtime: { ...selfHostedRuntime, forkingEnabled: false },
    })({
      request: request(),
      authenticationContext: sessionContext,
      requestId: 'request-1034',
    })
    expect(deploymentDisabled.status).toBe(404)
    expect(await deploymentDisabled.json()).toEqual({
      error: 'Workspace forking is not enabled on this deployment',
    })

    const enterpriseRequired = await handler({
      currentAccess: currentAccess('read'),
      lineage: projection,
      runtime: hostedRuntime,
      entitlement: entitlement(false),
    })({
      request: request(),
      authenticationContext: sessionContext,
      requestId: 'request-1034',
    })
    expect(enterpriseRequired.status).toBe(403)
    expect(await enterpriseRequired.json()).toEqual({
      error: 'Workspace forking is available on Enterprise plans only',
    })
    expect(projection.readForViewer).not.toHaveBeenCalled()
  })

  it('checks AppConfig before admin and requires current-workspace admin afterward', async () => {
    const disabled = await handler({
      currentAccess: currentAccess('read'),
      runtime: hostedRuntime,
      rollout: rollout(false),
    })({
      request: request(),
      authenticationContext: sessionContext,
      requestId: 'request-1034',
    })
    expect(disabled.status).toBe(404)
    expect(await disabled.json()).toEqual({
      error: 'Workspace forking is not enabled on this deployment',
    })

    const notAdmin = await handler({
      currentAccess: currentAccess('write'),
    })({
      request: request(),
      authenticationContext: sessionContext,
      requestId: 'request-1034',
    })
    expect(notAdmin.status).toBe(403)
    expect(await notAdmin.json()).toEqual({
      error: 'Admin access is required for this workspace',
    })
  })

  it('keeps persistence failures as request-id 500s', async () => {
    const response = await handler({
      lineage: {
        async readForViewer() {
          throw new Error('database unavailable')
        },
      },
    })({
      request: request(),
      authenticationContext: sessionContext,
      requestId: 'request-1034',
    })

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: 'Internal server error',
      requestId: 'request-1034',
    })
  })

  it('executes through session authentication and API-1034 native routing', async () => {
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
          nativeHandlers: { 'API-1034': handler() },
        }),
      }),
    })

    const response = await application.handle(
      new Request('http://api.test/api/workspaces/workspace-1/fork/lineage', {
        headers: {
          cookie: 'session=valid',
          'x-request-id': 'request-1034',
        },
      })
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('x-sim-api-backend')).toBe('native')
    expect(response.headers.get('x-sim-api-inventory-id')).toBe('API-1034')
  })
})

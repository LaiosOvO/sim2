import type { SessionRequestContext } from '@sim/api-contracts/auth'
import { getForkResourcesResponseV1Schema } from '@sim/api-contracts/workspace-forking'
import { createRequestAuthenticator } from '@sim/auth/request-context'
import { describe, expect, it, vi } from 'vitest'
import { createApiApplication } from '@/bootstrap/application/create-api-application'
import type { ForkingRuntimeConfig } from '@/config/forking-runtime'
import { createRoutedTenantReadBackend } from '@/modules/tenant-read/application/create-routed-tenant-read-backend'
import { createTenantReadModule } from '@/modules/tenant-read/application/create-tenant-read-module'
import { createGetForkResourcesUseCase } from '@/modules/workspace-forking/application/get-fork-resources'
import { createGetForkResourcesHandler } from '@/modules/workspace-forking/interface/create-get-fork-resources-handler'
import type { ForkEntitlementReader } from '@/modules/workspace-forking/ports/fork-entitlement-reader'
import type { ForkRolloutReader } from '@/modules/workspace-forking/ports/fork-rollout-reader'
import type { WorkspaceForkCurrentAccessReader } from '@/modules/workspace-forking/ports/workspace-fork-current-access-reader'
import type {
  WorkspaceForkResourceCatalog,
  WorkspaceForkResourceCatalogReader,
} from '@/modules/workspace-forking/ports/workspace-fork-resource-catalog-reader'

const sessionContext: SessionRequestContext = {
  authContextVersion: 1,
  requestId: 'request-1037',
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
    region: 'us-east-1',
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

function catalog(): WorkspaceForkResourceCatalogReader {
  return {
    readCopyable: vi.fn(
      async () =>
        ({
          files: [
            {
              id: 'file-1',
              label: 'Input.csv',
              folderId: 'folder-1',
              folderName: 'Inputs',
            },
            {
              id: 'file-2',
              label: 'Root.txt',
              folderId: null,
              folderName: null,
            },
          ],
          tables: [{ id: 'table-1', label: 'Customers' }],
          knowledgeBases: [{ id: 'knowledge-1', label: 'Handbook' }],
          customTools: [{ id: 'tool-1', label: 'Normalizer' }],
          skills: [{ id: 'skill-1', label: 'Research' }],
          mcpServers: [{ id: 'mcp-1', label: 'Internal MCP' }],
          workflowMcpServers: [{ id: 'workflow-mcp-1', label: 'Published workflows' }],
          deployedWorkflowCount: 3,
        }) satisfies WorkspaceForkResourceCatalog
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
    catalog?: WorkspaceForkResourceCatalogReader
    entitlement?: ForkEntitlementReader
    rollout?: ForkRolloutReader
    runtime?: ForkingRuntimeConfig
  } = {}
) {
  return createGetForkResourcesHandler(
    createGetForkResourcesUseCase({
      currentAccess: options.currentAccess ?? currentAccess(),
      catalog: options.catalog ?? catalog(),
      entitlement: options.entitlement ?? entitlement(),
      rollout: options.rollout ?? rollout(),
      runtime: options.runtime ?? selfHostedRuntime,
    })
  )
}

function request(workspaceId = 'workspace-1') {
  return new Request(`http://api.test/api/workspaces/${workspaceId}/fork/resources`)
}

describe('native workspace fork resources', () => {
  it('returns the stable copyable-resource contract', async () => {
    const response = await handler()({
      request: request(),
      authenticationContext: sessionContext,
      requestId: 'request-1037',
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(getForkResourcesResponseV1Schema.parse(body)).toEqual(body)
    expect(body).toEqual({
      files: [
        {
          id: 'file-1',
          label: 'Input.csv',
          folderId: 'folder-1',
          folderName: 'Inputs',
        },
        {
          id: 'file-2',
          label: 'Root.txt',
          folderId: null,
          folderName: null,
        },
      ],
      tables: [{ id: 'table-1', label: 'Customers' }],
      knowledgeBases: [{ id: 'knowledge-1', label: 'Handbook' }],
      customTools: [{ id: 'tool-1', label: 'Normalizer' }],
      skills: [{ id: 'skill-1', label: 'Research' }],
      mcpServers: [{ id: 'mcp-1', label: 'Internal MCP' }],
      workflowMcpServers: [{ id: 'workflow-mcp-1', label: 'Published workflows' }],
      deployedWorkflowCount: 3,
    })
  })

  it('authenticates before parsing or persistence access', async () => {
    const access = currentAccess()
    const response = await handler({ currentAccess: access })({
      request: request('%E0%A4%A'),
      requestId: 'request-1037',
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(access.findActiveForViewer).not.toHaveBeenCalled()
  })

  it('preserves validation and active-workspace-not-found responses', async () => {
    const invalid = await handler()({
      request: request('%E0%A4%A'),
      authenticationContext: sessionContext,
      requestId: 'request-1037',
    })
    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toMatchObject({ error: 'Validation error' })

    const missing = await handler()({
      request: request('workspace-missing'),
      authenticationContext: sessionContext,
      requestId: 'request-1037',
    })
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({
      error: 'Workspace not found',
      requestId: 'request-1037',
    })
  })

  it('checks deployment and Enterprise gates before admin permission', async () => {
    const projection = catalog()
    const deploymentDisabled = await handler({
      currentAccess: currentAccess('read'),
      catalog: projection,
      runtime: { ...selfHostedRuntime, forkingEnabled: false },
    })({
      request: request(),
      authenticationContext: sessionContext,
      requestId: 'request-1037',
    })
    expect(deploymentDisabled.status).toBe(404)
    expect(await deploymentDisabled.json()).toEqual({
      error: 'Workspace forking is not enabled on this deployment',
      requestId: 'request-1037',
    })

    const enterpriseRequired = await handler({
      currentAccess: currentAccess('read'),
      catalog: projection,
      runtime: hostedRuntime,
      entitlement: entitlement(false),
    })({
      request: request(),
      authenticationContext: sessionContext,
      requestId: 'request-1037',
    })
    expect(enterpriseRequired.status).toBe(403)
    expect(await enterpriseRequired.json()).toEqual({
      error: 'Workspace forking is available on Enterprise plans only',
      requestId: 'request-1037',
    })
    expect(projection.readCopyable).not.toHaveBeenCalled()
  })

  it('checks AppConfig before admin and requires current-workspace admin afterward', async () => {
    const projection = catalog()
    const rolloutDisabled = await handler({
      currentAccess: currentAccess('read'),
      catalog: projection,
      runtime: hostedRuntime,
      rollout: rollout(false),
    })({
      request: request(),
      authenticationContext: sessionContext,
      requestId: 'request-1037',
    })
    expect(rolloutDisabled.status).toBe(404)
    expect(await rolloutDisabled.json()).toEqual({
      error: 'Workspace forking is not enabled on this deployment',
      requestId: 'request-1037',
    })

    const notAdmin = await handler({
      currentAccess: currentAccess('write'),
      catalog: projection,
    })({
      request: request(),
      authenticationContext: sessionContext,
      requestId: 'request-1037',
    })
    expect(notAdmin.status).toBe(403)
    expect(await notAdmin.json()).toEqual({
      error: 'Admin access is required for this workspace',
      requestId: 'request-1037',
    })
    expect(projection.readCopyable).not.toHaveBeenCalled()
  })

  it('keeps catalog failures as request-id 500s', async () => {
    const response = await handler({
      catalog: {
        async readCopyable() {
          throw new Error('database unavailable')
        },
      },
    })({
      request: request(),
      authenticationContext: sessionContext,
      requestId: 'request-1037',
    })

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: 'Internal server error',
      requestId: 'request-1037',
    })
  })

  it('executes through session authentication and API-1037 native routing', async () => {
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
          nativeHandlers: { 'API-1037': handler() },
        }),
      }),
    })

    const response = await application.handle(
      new Request('http://api.test/api/workspaces/workspace-1/fork/resources', {
        headers: {
          cookie: 'session=valid',
          'x-request-id': 'request-1037',
        },
      })
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('x-sim-api-backend')).toBe('native')
    expect(response.headers.get('x-sim-api-inventory-id')).toBe('API-1037')
  })
})

import { workspaceBootstrapResponseV1Schema } from '@sim/api-contracts'
import type { SessionRequestContext } from '@sim/api-contracts/auth'
import type { RequestAccessResolver } from '@sim/auth/authorization'
import { createRequestAuthenticator } from '@sim/auth/request-context'
import { describe, expect, it, vi } from 'vitest'
import { createApiApplication } from '@/bootstrap/application/create-api-application'
import {
  createWorkspaceBootstrapModule,
  type WorkspaceBootstrapReadRepository,
} from '@/modules/workspace-bootstrap/workspace-bootstrap-module'

const sessionContext: SessionRequestContext = {
  authContextVersion: 1,
  requestId: 'request-1',
  authenticationMethod: 'session',
  actor: {
    id: 'viewer-1',
    type: 'user',
    name: 'Viewer',
    email: 'viewer@example.com',
  },
  credentialId: 'session-1',
  activeOrganizationId: null,
  permissions: [],
}

const bootstrapProjection = {
  workflows: [
    {
      id: 'workflow-1',
      name: 'Workflow',
      description: null,
      folderId: null,
      updatedAt: '2026-01-01T00:00:00.000Z',
      isDeployed: false,
    },
  ],
  folders: [],
  chats: [
    {
      id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      title: 'Chat',
      updatedAt: '2026-01-01T00:00:00.000Z',
      pinned: false,
      activeStreamId: null,
    },
  ],
  files: [],
}

function authentication() {
  return createRequestAuthenticator({
    sessions: {
      async verify(headers) {
        return headers.get('cookie') === 'session=valid'
          ? {
              verified: true as const,
              credential: {
                actor: sessionContext.actor,
                sessionId: sessionContext.credentialId,
                activeOrganizationId: sessionContext.activeOrganizationId,
              },
            }
          : { verified: false as const, reason: 'invalid' as const }
      },
    },
  })
}

function access(permission: 'read' | null = 'read'): RequestAccessResolver {
  return {
    workspacePermission: vi.fn(async () => permission),
    organizationRole: vi.fn(async () => null),
    workflow: vi.fn(async () => null),
  }
}

function repository(): WorkspaceBootstrapReadRepository {
  return {
    load: vi.fn(async () => bootstrapProjection),
  }
}

describe('Workspace bootstrap module', () => {
  it('returns one browser-safe projection for the complete Home surface', async () => {
    const projection = repository()
    const application = createApiApplication({
      workspaceBootstrap: createWorkspaceBootstrapModule({
        authentication: authentication(),
        access: access(),
        repository: projection,
      }),
    })

    const response = await application.handle(
      new Request('http://api.test/api/workspace-bootstrap?workspaceId=workspace-1', {
        headers: { cookie: 'session=valid', 'x-request-id': 'request-1' },
      })
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('x-sim-api-module')).toBe('workspace-bootstrap')
    const body = await response.json()
    expect(workspaceBootstrapResponseV1Schema.parse(body)).toEqual({
      session: {
        user: {
          id: sessionContext.actor.id,
          name: sessionContext.actor.name,
          email: sessionContext.actor.email,
        },
      },
      ...bootstrapProjection,
    })
    expect(projection.load).toHaveBeenCalledWith('workspace-1', 'viewer-1')
  })

  it('rejects requests without a valid session before reading data', async () => {
    const projection = repository()
    const application = createApiApplication({
      workspaceBootstrap: createWorkspaceBootstrapModule({
        authentication: authentication(),
        access: access(),
        repository: projection,
      }),
    })

    const response = await application.handle(
      new Request('http://api.test/api/workspace-bootstrap?workspaceId=workspace-1')
    )

    expect(response.status).toBe(401)
    expect(projection.load).not.toHaveBeenCalled()
  })

  it('conceals inaccessible workspaces and skips all four projection queries', async () => {
    const projection = repository()
    const application = createApiApplication({
      workspaceBootstrap: createWorkspaceBootstrapModule({
        authentication: authentication(),
        access: access(null),
        repository: projection,
      }),
    })

    const response = await application.handle(
      new Request('http://api.test/api/workspace-bootstrap?workspaceId=workspace-2', {
        headers: { cookie: 'session=valid' },
      })
    )

    expect(response.status).toBe(404)
    expect(projection.load).not.toHaveBeenCalled()
  })
})

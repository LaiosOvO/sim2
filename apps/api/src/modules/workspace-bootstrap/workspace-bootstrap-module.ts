import {
  type WorkspaceBootstrapResponseV1,
  workspaceBootstrapQueryV1Schema,
  workspaceBootstrapResponseV1Schema,
} from '@sim/api-contracts'
import { authorizeRequestContext, type RequestAccessResolver } from '@sim/auth/authorization'
import type { RequestAuthenticator } from '@sim/auth/request-context'
import { createLogger } from '@sim/logger'
import type { ApiRequestContext } from '@/http/request-context'

const logger = createLogger('WorkspaceBootstrapAPI')
const routePath = '/api/workspace-bootstrap'

export interface WorkspaceBootstrapReadRepository {
  load(workspaceId: string, userId: string): Promise<Omit<WorkspaceBootstrapResponseV1, 'session'>>
}

export interface WorkspaceBootstrapModule {
  handle(request: Request, context: ApiRequestContext): Promise<Response | undefined>
}

export interface WorkspaceBootstrapModuleDependencies {
  authentication: RequestAuthenticator
  access: RequestAccessResolver
  repository: WorkspaceBootstrapReadRepository
}

export function createWorkspaceBootstrapModule(
  dependencies: WorkspaceBootstrapModuleDependencies
): WorkspaceBootstrapModule {
  return {
    async handle(request, context) {
      const url = new URL(request.url)
      if (request.method !== 'GET' || url.pathname !== routePath) return undefined

      const query = workspaceBootstrapQueryV1Schema.safeParse(
        Object.fromEntries(url.searchParams.entries())
      )
      if (!query.success) {
        return Response.json({ error: 'Invalid workspaceId' }, { status: 400 })
      }

      const authentication = await dependencies.authentication.authenticate({
        request,
        requestId: context.requestId,
        policy: { mode: 'session' },
      })
      if (!authentication.ok || authentication.context.authenticationMethod !== 'session') {
        return Response.json(
          { error: authentication.ok ? 'Authentication required' : authentication.error.message },
          { status: authentication.ok ? 401 : authentication.error.status }
        )
      }

      const authorization = await authorizeRequestContext(
        authentication.context,
        dependencies.access,
        {
          type: 'workspace',
          workspaceId: query.data.workspaceId,
          access: 'read',
        }
      )
      if (!authorization.allowed) {
        return Response.json({ error: 'Workspace not found or access denied' }, { status: 404 })
      }

      try {
        const data = await dependencies.repository.load(
          query.data.workspaceId,
          authentication.context.actor.id
        )
        const response = workspaceBootstrapResponseV1Schema.parse({
          session: {
            user: {
              id: authentication.context.actor.id,
              name: authentication.context.actor.name ?? null,
              email: authentication.context.actor.email ?? null,
            },
          },
          ...data,
        })
        return Response.json(response, {
          headers: {
            'cache-control': 'private, no-store',
            'x-sim-api-module': 'workspace-bootstrap',
          },
        })
      } catch (error) {
        logger.error('Unable to load Workspace bootstrap projection', {
          error,
          requestId: context.requestId,
          workspaceId: query.data.workspaceId,
        })
        return Response.json({ error: 'Unable to load Workspace' }, { status: 500 })
      }
    },
  }
}

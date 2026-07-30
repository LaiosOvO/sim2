import type { AuthenticatedRequestContext } from '@sim/api-contracts/auth'
import { createLogger } from '@sim/logger'
import type { GetForkResourcesUseCase } from '@/modules/workspace-forking/application/get-fork-resources'

const logger = createLogger('ForkResourcesAPI')
const routePattern = /^\/api\/workspaces\/([^/]+)\/fork\/resources$/

export interface GetForkResourcesHandlerInput {
  request: Request
  authenticationContext?: AuthenticatedRequestContext
  requestId: string
}

export type GetForkResourcesHandler = (input: GetForkResourcesHandlerInput) => Promise<Response>

function workspaceId(request: Request): string {
  const match = routePattern.exec(new URL(request.url).pathname)
  if (!match) return ''
  try {
    return decodeURIComponent(match[1] ?? '')
  } catch {
    return ''
  }
}

export function createGetForkResourcesHandler(
  useCase: GetForkResourcesUseCase
): GetForkResourcesHandler {
  return async ({ request, authenticationContext, requestId }) => {
    if (
      authenticationContext?.authenticationMethod !== 'session' ||
      authenticationContext.actor.type !== 'user'
    ) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const id = workspaceId(request)
    try {
      const result = await useCase.execute(authenticationContext, id)
      if (result.ok) return Response.json(result.value)
      if (result.reason === 'validation-error') {
        return Response.json(
          { error: 'Validation error', details: result.details },
          { status: 400 }
        )
      }
      if (result.reason === 'workspace-not-found') {
        return Response.json({ error: 'Workspace not found', requestId }, { status: 404 })
      }
      if (result.reason === 'enterprise-required') {
        return Response.json(
          {
            error: 'Workspace forking is available on Enterprise plans only',
            requestId,
          },
          { status: 403 }
        )
      }
      if (result.reason === 'admin-required') {
        return Response.json(
          { error: 'Admin access is required for this workspace', requestId },
          { status: 403 }
        )
      }
      return Response.json(
        {
          error: 'Workspace forking is not enabled on this deployment',
          requestId,
        },
        { status: 404 }
      )
    } catch (error) {
      logger.error('Failed to read copyable workspace fork resources', {
        error,
        requestId,
        workspaceId: id,
      })
      return Response.json({ error: 'Internal server error', requestId }, { status: 500 })
    }
  }
}

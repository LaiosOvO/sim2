import type { AuthenticatedRequestContext } from '@sim/api-contracts/auth'
import { createLogger } from '@sim/logger'
import type { ListWorkspaceBackgroundWorkUseCase } from '@/modules/workspace-forking/application/list-workspace-background-work'

const logger = createLogger('WorkspaceBackgroundWorkAPI')
const routePattern = /^\/api\/workspaces\/([^/]+)\/background-work$/

export interface ListWorkspaceBackgroundWorkHandlerInput {
  readonly authenticationContext?: AuthenticatedRequestContext
  readonly request: Request
  readonly requestId: string
}

export type ListWorkspaceBackgroundWorkHandler = (
  input: ListWorkspaceBackgroundWorkHandlerInput
) => Promise<Response>

function pathWorkspaceId(request: Request): string {
  const match = routePattern.exec(new URL(request.url).pathname)
  if (!match) return ''
  try {
    return decodeURIComponent(match[1] ?? '')
  } catch {
    return ''
  }
}

export function createListWorkspaceBackgroundWorkHandler(
  useCase: ListWorkspaceBackgroundWorkUseCase
): ListWorkspaceBackgroundWorkHandler {
  return async ({ authenticationContext, request, requestId }) => {
    if (
      authenticationContext?.authenticationMethod !== 'session' ||
      authenticationContext.actor.type !== 'user'
    ) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const workspaceId = pathWorkspaceId(request)
    try {
      const result = await useCase.execute(authenticationContext, workspaceId, {
        ...(url.searchParams.has('cursor') ? { cursor: url.searchParams.get('cursor') ?? '' } : {}),
        ...(url.searchParams.has('limit') ? { limit: url.searchParams.get('limit') ?? '' } : {}),
      })
      if (result.ok) return Response.json(result.value)
      if (result.reason === 'validation-error') {
        return Response.json(
          { details: result.details, error: 'Validation error' },
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
          {
            error: 'Admin access is required for this workspace',
            requestId,
          },
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
      logger.error('Failed to list workspace background work', {
        error,
        requestId,
        workspaceId,
      })
      return Response.json({ error: 'Internal server error', requestId }, { status: 500 })
    }
  }
}

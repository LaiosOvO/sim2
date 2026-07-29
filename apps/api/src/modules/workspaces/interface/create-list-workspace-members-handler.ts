import type { AuthenticatedRequestContext } from '@sim/api-contracts/auth'
import { createLogger } from '@sim/logger'
import type { ListWorkspaceMembersUseCase } from '@/modules/workspaces/application/list-workspace-members'

const logger = createLogger('WorkspaceMembersAPI')
const workspaceMembersPath = /^\/api\/workspaces\/([^/]+)\/members$/

export interface ListWorkspaceMembersHandlerInput {
  request: Request
  authenticationContext?: AuthenticatedRequestContext
  requestId: string
}

export type ListWorkspaceMembersHandler = (
  input: ListWorkspaceMembersHandlerInput
) => Promise<Response>

function workspaceIdFromRequest(request: Request): string | undefined {
  const match = workspaceMembersPath.exec(new URL(request.url).pathname)
  if (!match?.[1]) return undefined
  try {
    return decodeURIComponent(match[1])
  } catch {
    return undefined
  }
}

export function createListWorkspaceMembersHandler(
  useCase: ListWorkspaceMembersUseCase
): ListWorkspaceMembersHandler {
  return async ({ request, authenticationContext, requestId }) => {
    const workspaceId = workspaceIdFromRequest(request)
    if (!workspaceId) {
      return Response.json({ error: 'Invalid route parameters' }, { status: 400 })
    }
    if (authenticationContext?.authenticationMethod !== 'session') {
      return Response.json({ error: 'Authentication required' }, { status: 401 })
    }

    try {
      const result = await useCase.execute(authenticationContext, workspaceId)
      if (!result.ok) {
        return Response.json({ error: 'Workspace not found or access denied' }, { status: 404 })
      }
      return Response.json(result.value)
    } catch (error) {
      logger.error('Error fetching workspace members', {
        error,
        requestId,
        workspaceId,
      })
      return Response.json({ error: 'Failed to fetch workspace members' }, { status: 500 })
    }
  }
}

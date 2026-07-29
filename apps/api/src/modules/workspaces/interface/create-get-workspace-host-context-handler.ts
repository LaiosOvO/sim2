import type { AuthenticatedRequestContext } from '@sim/api-contracts/auth'
import { workspaceIdV1Schema } from '@sim/api-contracts/workspaces'
import { createLogger } from '@sim/logger'
import type { GetWorkspaceHostContextUseCase } from '@/modules/workspaces/application/get-workspace-host-context'

const logger = createLogger('WorkspaceHostContextAPI')
const workspaceHostContextPath = /^\/api\/workspaces\/([^/]+)\/host-context$/

export interface GetWorkspaceHostContextHandlerInput {
  request: Request
  authenticationContext?: AuthenticatedRequestContext
  requestId: string
}

export type GetWorkspaceHostContextHandler = (
  input: GetWorkspaceHostContextHandlerInput
) => Promise<Response>

function workspaceIdFromRequest(request: Request): string | undefined {
  const match = workspaceHostContextPath.exec(new URL(request.url).pathname)
  if (!match?.[1]) return undefined
  try {
    const parsed = workspaceIdV1Schema.safeParse(decodeURIComponent(match[1]))
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}

export function createGetWorkspaceHostContextHandler(
  useCase: GetWorkspaceHostContextUseCase
): GetWorkspaceHostContextHandler {
  return async ({ request, authenticationContext, requestId }) => {
    if (authenticationContext?.authenticationMethod !== 'session') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const workspaceId = workspaceIdFromRequest(request)
    if (!workspaceId) {
      return Response.json({ error: 'Validation error', details: [] }, { status: 400 })
    }

    try {
      const result = await useCase.execute(authenticationContext, workspaceId)
      if (!result.ok) {
        return Response.json({ error: 'Workspace access denied' }, { status: 403 })
      }
      return Response.json(result.value)
    } catch (error) {
      logger.error('Failed to get workspace host context', {
        error,
        requestId,
        workspaceId,
      })
      return Response.json({ error: 'Internal server error', requestId }, { status: 500 })
    }
  }
}

import type { AuthenticatedRequestContext } from '@sim/api-contracts/auth'
import { createLogger } from '@sim/logger'
import type { ListOrganizationWorkspacesUseCase } from '@/modules/organizations/application/list-organization-workspaces'

const logger = createLogger('OrganizationWorkspaces')
const organizationWorkspacesPath = /^\/api\/organizations\/([^/]+)\/workspaces$/

export interface ListOrganizationWorkspacesHandlerInput {
  request: Request
  authenticationContext?: AuthenticatedRequestContext
  requestId: string
}

export type ListOrganizationWorkspacesHandler = (
  input: ListOrganizationWorkspacesHandlerInput
) => Promise<Response>

function organizationIdFromRequest(request: Request): string | undefined {
  const match = organizationWorkspacesPath.exec(new URL(request.url).pathname)
  if (!match?.[1]) return undefined
  try {
    return decodeURIComponent(match[1])
  } catch {
    return undefined
  }
}

export function createListOrganizationWorkspacesHandler(
  useCase: ListOrganizationWorkspacesUseCase
): ListOrganizationWorkspacesHandler {
  return async ({ request, authenticationContext, requestId }) => {
    const organizationId = organizationIdFromRequest(request)
    if (!organizationId) {
      return Response.json({ error: 'Invalid route parameters' }, { status: 400 })
    }
    if (authenticationContext?.authenticationMethod !== 'session') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
      const result = await useCase.execute(authenticationContext, organizationId)
      if (!result.ok) {
        return Response.json(
          {
            error:
              result.reason === 'admin-required'
                ? 'Admin permissions required'
                : 'Access Control is an Enterprise feature',
          },
          { status: 403 }
        )
      }
      logger.info('Listed organization workspaces', {
        organizationId,
        count: result.value.workspaces.length,
      })
      return Response.json(result.value)
    } catch (error) {
      logger.error('Failed to list organization workspaces', {
        error,
        organizationId,
        requestId,
      })
      return Response.json({ error: 'Internal server error', requestId }, { status: 500 })
    }
  }
}

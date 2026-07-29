import type { AuthenticatedRequestContext } from '@sim/api-contracts/auth'
import { userPermissionGroupWorkspaceIdV1Schema } from '@sim/api-contracts/permission-groups'
import { createLogger } from '@sim/logger'
import type { GetUserPermissionGroupUseCase } from '@/modules/permission-groups/application/get-user-permission-group'

const logger = createLogger('UserPermissionGroup')

export interface GetUserPermissionGroupHandlerInput {
  request: Request
  authenticationContext?: AuthenticatedRequestContext
  requestId: string
}

export type GetUserPermissionGroupHandler = (
  input: GetUserPermissionGroupHandlerInput
) => Promise<Response>

export function createGetUserPermissionGroupHandler(
  useCase: GetUserPermissionGroupUseCase
): GetUserPermissionGroupHandler {
  return async ({ request, authenticationContext, requestId }) => {
    if (authenticationContext?.authenticationMethod !== 'session') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const workspaceId = new URL(request.url).searchParams.get('workspaceId')
    const parsedWorkspaceId = userPermissionGroupWorkspaceIdV1Schema.safeParse(workspaceId)
    if (!parsedWorkspaceId.success) {
      return Response.json({ error: 'workspaceId is required' }, { status: 400 })
    }

    try {
      const result = await useCase.execute(authenticationContext, parsedWorkspaceId.data)
      if (!result.ok) {
        return Response.json(
          {
            error:
              result.reason === 'workspace-not-found'
                ? 'Workspace not found'
                : 'Not a member of this workspace',
          },
          { status: result.reason === 'workspace-not-found' ? 404 : 403 }
        )
      }
      return Response.json(result.value)
    } catch (error) {
      logger.error('Failed to get user permission group', {
        error,
        requestId,
        workspaceId: parsedWorkspaceId.data,
      })
      return Response.json({ error: 'Internal server error', requestId }, { status: 500 })
    }
  }
}

import type { AuthenticatedRequestContext } from '@sim/api-contracts/auth'
import { createLogger } from '@sim/logger'
import type { GetPersonalProfileUseCase } from '@/modules/identity/application/get-personal-profile'

const logger = createLogger('PersonalProfileAPI')
const personalProfilePath = /^\/api\/workspaces\/([^/]+)\/personal-profile$/

export interface GetPersonalProfileHandlerInput {
  request: Request
  authenticationContext?: AuthenticatedRequestContext
  requestId: string
}

export type GetPersonalProfileHandler = (input: GetPersonalProfileHandlerInput) => Promise<Response>

function workspaceIdFromRequest(request: Request): string | undefined {
  const match = personalProfilePath.exec(new URL(request.url).pathname)
  if (!match?.[1]) return undefined
  try {
    return decodeURIComponent(match[1])
  } catch {
    return undefined
  }
}

export function createGetPersonalProfileHandler(
  useCase: GetPersonalProfileUseCase
): GetPersonalProfileHandler {
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
        return Response.json(
          {
            error: `Workspace access denied: ${workspaceId}`,
            requestId,
          },
          { status: 403 }
        )
      }
      return Response.json(result.value)
    } catch (error) {
      logger.error('Failed to read personal identity profile', {
        error,
        requestId,
        workspaceId,
      })
      return Response.json({ error: 'Internal server error', requestId }, { status: 500 })
    }
  }
}

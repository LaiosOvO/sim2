import type { AuthenticatedRequestContext } from '@sim/api-contracts/auth'
import { createLogger } from '@sim/logger'
import type { GetForkAvailabilityUseCase } from '@/modules/workspace-forking/application/get-fork-availability'

const logger = createLogger('ForkAvailabilityAPI')
const routePattern = /^\/api\/workspaces\/([^/]+)\/fork\/availability$/

export interface GetForkAvailabilityHandlerInput {
  request: Request
  authenticationContext?: AuthenticatedRequestContext
  requestId: string
}

export type GetForkAvailabilityHandler = (
  input: GetForkAvailabilityHandlerInput
) => Promise<Response>

function workspaceId(request: Request): string {
  const match = routePattern.exec(new URL(request.url).pathname)
  if (!match) return ''
  try {
    return decodeURIComponent(match[1] ?? '')
  } catch {
    return ''
  }
}

export function createGetForkAvailabilityHandler(
  useCase: GetForkAvailabilityUseCase
): GetForkAvailabilityHandler {
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
      if (result.reason === 'workspace-not-found') {
        return Response.json({ error: 'Workspace not found' }, { status: 404 })
      }
      return Response.json({ error: 'Validation error', details: result.details }, { status: 400 })
    } catch (error) {
      logger.error('Failed to read workspace fork availability', {
        error,
        requestId,
        workspaceId: id,
      })
      return Response.json({ error: 'Internal server error', requestId }, { status: 500 })
    }
  }
}

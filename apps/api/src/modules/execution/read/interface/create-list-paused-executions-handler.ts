import type { AuthenticatedRequestContext } from '@sim/api-contracts/auth'
import { createLogger } from '@sim/logger'
import type { ListPausedExecutionsUseCase } from '@/modules/execution/read/application/list-paused-executions'

const logger = createLogger('PausedExecutionListAPI')
const routePattern = /^\/api\/workflows\/([^/]+)\/paused$/

export interface ListPausedExecutionsHandlerInput {
  request: Request
  authenticationContext?: AuthenticatedRequestContext
  requestId: string
}

export type ListPausedExecutionsHandler = (
  input: ListPausedExecutionsHandlerInput
) => Promise<Response>

function workflowId(request: Request): string {
  const match = routePattern.exec(new URL(request.url).pathname)
  try {
    return decodeURIComponent(match?.[1] ?? '')
  } catch {
    return ''
  }
}

export function createListPausedExecutionsHandler(
  useCase: ListPausedExecutionsUseCase
): ListPausedExecutionsHandler {
  return async ({ request, authenticationContext, requestId }) => {
    if (
      !authenticationContext ||
      authenticationContext.actor.type !== 'user' ||
      authenticationContext.authenticationMethod === 'public-token'
    ) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const id = workflowId(request)
    const status = new URL(request.url).searchParams.get('status') ?? undefined
    try {
      const result = await useCase.execute(authenticationContext, {
        workflowId: id,
        status,
      })
      if (result.ok) return Response.json(result.value)
      if (result.reason === 'validation-error') {
        return Response.json(
          { error: 'Validation error', details: result.details },
          { status: 400 }
        )
      }
      return Response.json({ error: result.message }, { status: result.status })
    } catch (error) {
      logger.error('Failed to list paused executions', {
        error,
        requestId,
        workflowId: id,
      })
      return Response.json({ error: 'Internal server error', requestId }, { status: 500 })
    }
  }
}

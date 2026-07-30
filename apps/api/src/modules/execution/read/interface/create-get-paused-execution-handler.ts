import type { AuthenticatedRequestContext } from '@sim/api-contracts/auth'
import { createLogger } from '@sim/logger'
import type { GetPausedExecutionUseCase } from '@/modules/execution/read/application/get-paused-execution'

const logger = createLogger('PausedExecutionDetailAPI')
const resumePattern = /^\/api\/resume\/([^/]+)\/([^/]+)$/
const workflowPattern = /^\/api\/workflows\/([^/]+)\/paused\/([^/]+)$/

export interface GetPausedExecutionHandlerInput {
  request: Request
  authenticationContext?: AuthenticatedRequestContext
  requestId: string
}

export type GetPausedExecutionHandler = (input: GetPausedExecutionHandlerInput) => Promise<Response>

function decode(value: string | undefined): string {
  try {
    return decodeURIComponent(value ?? '')
  } catch {
    return ''
  }
}

function params(request: Request): { workflowId: string; executionId: string } {
  const pathname = new URL(request.url).pathname
  const match = resumePattern.exec(pathname) ?? workflowPattern.exec(pathname)
  return {
    workflowId: decode(match?.[1]),
    executionId: decode(match?.[2]),
  }
}

export function createGetPausedExecutionHandler(
  useCase: GetPausedExecutionUseCase
): GetPausedExecutionHandler {
  return async ({ request, authenticationContext, requestId }) => {
    if (
      !authenticationContext ||
      authenticationContext.actor.type !== 'user' ||
      authenticationContext.authenticationMethod === 'public-token'
    ) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const input = params(request)
    try {
      const result = await useCase.execute(authenticationContext, input)
      if (result.ok) return Response.json(result.value)
      if (result.reason === 'validation-error') {
        return Response.json(
          { error: 'Validation error', details: result.details },
          { status: 400 }
        )
      }
      if (result.reason === 'access-error') {
        return Response.json({ error: result.message }, { status: result.status })
      }
      return Response.json({ error: 'Paused execution not found' }, { status: 404 })
    } catch (error) {
      logger.error('Failed to load paused execution detail', {
        error,
        requestId,
        workflowId: input.workflowId,
        executionId: input.executionId,
      })
      return Response.json({ error: 'Internal server error', requestId }, { status: 500 })
    }
  }
}

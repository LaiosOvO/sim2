import type { AuthenticatedRequestContext } from '@sim/api-contracts/auth'
import { createLogger } from '@sim/logger'
import type { GetWorkspaceExecutionMetricsUseCase } from '@/modules/workspaces/application/get-workspace-execution-metrics'

const logger = createLogger('WorkspaceExecutionMetricsAPI')
const routePattern = /^\/api\/workspaces\/([^/]+)\/metrics\/executions$/

export interface GetWorkspaceExecutionMetricsHandlerInput {
  request: Request
  authenticationContext?: AuthenticatedRequestContext
  requestId: string
}

export type GetWorkspaceExecutionMetricsHandler = (
  input: GetWorkspaceExecutionMetricsHandlerInput
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

function query(request: Request): Record<string, string> {
  return Object.fromEntries(new URL(request.url).searchParams.entries())
}

export function createGetWorkspaceExecutionMetricsHandler(
  useCase: GetWorkspaceExecutionMetricsUseCase
): GetWorkspaceExecutionMetricsHandler {
  return async ({ request, authenticationContext, requestId }) => {
    if (authenticationContext?.authenticationMethod !== 'session') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
      const result = await useCase.execute(
        authenticationContext,
        workspaceId(request),
        query(request)
      )
      if (result.ok) return Response.json(result.value)
      if (result.reason === 'invalid-time-range') {
        return Response.json({ error: 'Invalid time range' }, { status: 400 })
      }
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    } catch (error) {
      logger.error('Failed to compute workspace execution metrics', {
        error,
        requestId,
        workspaceId: workspaceId(request),
      })
      return Response.json({ error: 'Failed to compute metrics' }, { status: 500 })
    }
  }
}

import type { AuthenticatedRequestContext } from '@sim/api-contracts/auth'
import { createLogger } from '@sim/logger'
import type { ListDataDrainRunsUseCase } from '@/modules/data-drains/application/list-data-drain-runs'

const logger = createLogger('DataDrainRunsAPI')
const dataDrainRunsPath = /^\/api\/organizations\/([^/]+)\/data-drains\/([^/]+)\/runs$/

export interface ListDataDrainRunsHandlerInput {
  request: Request
  authenticationContext?: AuthenticatedRequestContext
  requestId: string
}

export type ListDataDrainRunsHandler = (input: ListDataDrainRunsHandlerInput) => Promise<Response>

function routeIds(request: Request): { organizationId: string; drainId: string } {
  const match = dataDrainRunsPath.exec(new URL(request.url).pathname)
  if (!match) return { organizationId: '', drainId: '' }
  try {
    return {
      organizationId: decodeURIComponent(match[1] ?? ''),
      drainId: decodeURIComponent(match[2] ?? ''),
    }
  } catch {
    return { organizationId: '', drainId: '' }
  }
}

function rawLimit(request: Request): unknown {
  const values = new URL(request.url).searchParams.getAll('limit')
  return values.length > 1 ? values : values[0]
}

export function createListDataDrainRunsHandler(
  useCase: ListDataDrainRunsUseCase
): ListDataDrainRunsHandler {
  return async ({ request, authenticationContext, requestId }) => {
    if (authenticationContext?.authenticationMethod !== 'session') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const ids = routeIds(request)

    try {
      const result = await useCase.execute(authenticationContext, {
        ...ids,
        rawLimit: rawLimit(request),
      })
      if (result.ok) return Response.json(result.value)

      const mapping = {
        'organization-membership-required': {
          status: 403,
          error: 'Forbidden - Not a member of this organization',
        },
        'deployment-disabled': {
          status: 404,
          error: 'Data Drains are not enabled on this deployment',
        },
        'enterprise-required': {
          status: 403,
          error: 'Data Drains are available on Enterprise plans only',
        },
        'organization-admin-required': {
          status: 403,
          error: 'Forbidden - Only organization owners and admins can view data drains',
        },
        'drain-not-found': { status: 404, error: 'Data drain not found' },
      } as const
      if (result.reason === 'validation-error') {
        return Response.json(
          { error: 'Validation error', details: result.details ?? [] },
          { status: 400 }
        )
      }
      const failure = mapping[result.reason]
      return Response.json({ error: failure.error }, { status: failure.status })
    } catch (error) {
      logger.error('Failed to list data drain runs', {
        error,
        requestId,
        ...ids,
      })
      return Response.json({ error: 'Internal server error', requestId }, { status: 500 })
    }
  }
}

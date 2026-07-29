import type { AuthenticatedRequestContext } from '@sim/api-contracts/auth'
import { createLogger } from '@sim/logger'
import type { ListOrganizationRosterUseCase } from '@/modules/organizations/application/list-organization-roster'

const logger = createLogger('OrganizationRoster')
const organizationRosterPath = /^\/api\/organizations\/([^/]+)\/roster$/

export interface ListOrganizationRosterHandlerInput {
  request: Request
  authenticationContext?: AuthenticatedRequestContext
  requestId: string
}

export type ListOrganizationRosterHandler = (
  input: ListOrganizationRosterHandlerInput
) => Promise<Response>

function organizationIdFromRequest(request: Request): string | undefined {
  const match = organizationRosterPath.exec(new URL(request.url).pathname)
  if (!match?.[1]) return undefined
  try {
    return decodeURIComponent(match[1])
  } catch {
    return undefined
  }
}

export function createListOrganizationRosterHandler(
  useCase: ListOrganizationRosterUseCase
): ListOrganizationRosterHandler {
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
          { error: 'Forbidden - Not a member of this organization' },
          { status: 403 }
        )
      }
      logger.info('Listed organization roster', {
        organizationId,
        memberCount: result.value.data.members.length,
      })
      return Response.json(result.value)
    } catch (error) {
      logger.error('Failed to fetch organization roster', { error, organizationId, requestId })
      return Response.json({ error: 'Failed to fetch organization roster' }, { status: 500 })
    }
  }
}

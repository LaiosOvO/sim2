import type { AuthenticatedRequestContext } from '@sim/api-contracts/auth'
import { createLogger } from '@sim/logger'
import type { ListMyInvitationsUseCase } from '@/modules/invitations/application/list-my-invitations'

const logger = createLogger('ListMyInvitationsAPI')

export interface ListMyInvitationsHandlerInput {
  authenticationContext?: AuthenticatedRequestContext
  requestId: string
}

export type ListMyInvitationsHandler = (input: ListMyInvitationsHandlerInput) => Promise<Response>

export function createListMyInvitationsHandler(
  useCase: ListMyInvitationsUseCase
): ListMyInvitationsHandler {
  return async ({ authenticationContext, requestId }) => {
    if (
      authenticationContext?.authenticationMethod !== 'session' ||
      !authenticationContext.actor.email
    ) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
      return Response.json(await useCase.execute(authenticationContext.actor.email))
    } catch (error) {
      logger.error('Failed to list pending invitations', { error, requestId })
      return Response.json({ error: 'Failed to list invitations' }, { status: 500 })
    }
  }
}

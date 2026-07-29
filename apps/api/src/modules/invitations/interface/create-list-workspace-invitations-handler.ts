import type { AuthenticatedRequestContext } from '@sim/api-contracts/auth'
import { createLogger } from '@sim/logger'
import type { ListWorkspaceInvitationsUseCase } from '@/modules/invitations/application/list-workspace-invitations'

const logger = createLogger('WorkspaceInvitationsAPI')

export interface ListWorkspaceInvitationsHandlerInput {
  authenticationContext?: AuthenticatedRequestContext
  requestId: string
}

export type ListWorkspaceInvitationsHandler = (
  input: ListWorkspaceInvitationsHandlerInput
) => Promise<Response>

export function createListWorkspaceInvitationsHandler(
  useCase: ListWorkspaceInvitationsUseCase
): ListWorkspaceInvitationsHandler {
  return async ({ authenticationContext, requestId }) => {
    if (authenticationContext?.authenticationMethod !== 'session') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
      return Response.json(await useCase.execute(authenticationContext.actor.id))
    } catch (error) {
      logger.error('Error fetching workspace invitations', { error, requestId })
      return Response.json({ error: 'Failed to fetch invitations' }, { status: 500 })
    }
  }
}

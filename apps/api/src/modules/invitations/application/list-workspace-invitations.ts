import {
  type ListWorkspaceInvitationsResponseV1,
  listWorkspaceInvitationsResponseV1Schema,
} from '@sim/api-contracts/invitations'
import type { WorkspaceInvitationReadRepository } from '@/modules/invitations/ports/invitation-read-repository'

export interface ListWorkspaceInvitationsUseCase {
  execute(userId: string): Promise<ListWorkspaceInvitationsResponseV1>
}

export function createListWorkspaceInvitationsUseCase(
  repository: WorkspaceInvitationReadRepository
): ListWorkspaceInvitationsUseCase {
  return {
    async execute(userId) {
      const invitations = await repository.listForAccessibleWorkspaces(userId)
      return listWorkspaceInvitationsResponseV1Schema.parse({
        invitations: invitations.map((invitation) => ({
          id: invitation.id,
          kind: invitation.kind,
          email: invitation.email,
          token: invitation.token,
          status: invitation.status,
          expiresAt: invitation.expiresAt.toISOString(),
          createdAt: invitation.createdAt.toISOString(),
          updatedAt: invitation.updatedAt.toISOString(),
          organizationId: invitation.organizationId,
          membershipIntent: invitation.membershipIntent,
          inviterId: invitation.inviterId,
          workspaceId: invitation.workspaceId,
          permission: invitation.permission,
        })),
      })
    },
  }
}

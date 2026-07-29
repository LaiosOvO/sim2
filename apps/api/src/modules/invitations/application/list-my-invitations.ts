import {
  type ListMyInvitationsResponseV1,
  listMyInvitationsResponseV1Schema,
} from '@sim/api-contracts/invitations'
import type { InvitationReadRepository } from '@/modules/invitations/ports/invitation-read-repository'

export interface ListMyInvitationsUseCase {
  execute(email: string): Promise<ListMyInvitationsResponseV1>
}

export function createListMyInvitationsUseCase(
  repository: InvitationReadRepository
): ListMyInvitationsUseCase {
  return {
    async execute(email) {
      const invitations = await repository.listPendingForEmail(email)
      return listMyInvitationsResponseV1Schema.parse({
        invitations: invitations.map((invitation) => ({
          id: invitation.id,
          kind: invitation.kind,
          email: invitation.email,
          organizationId: invitation.organizationId,
          organizationName: invitation.organizationName,
          membershipIntent: invitation.membershipIntent,
          role: invitation.role,
          status: invitation.status,
          expiresAt: invitation.expiresAt.toISOString(),
          createdAt: invitation.createdAt.toISOString(),
          inviterName: invitation.inviterName,
          inviterEmail: invitation.inviterEmail,
          grants: invitation.grants.map((grant) => ({
            workspaceId: grant.workspaceId,
            workspaceName: grant.workspaceName,
            permission: grant.permission,
          })),
        })),
      })
    },
  }
}

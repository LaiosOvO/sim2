export type InvitationKind = 'organization' | 'workspace'
export type InvitationMembershipIntent = 'internal' | 'external'
export type InvitationWorkspacePermission = 'admin' | 'write' | 'read'

export interface PendingInvitationGrantRecord {
  workspaceId: string
  workspaceName: string | null
  permission: InvitationWorkspacePermission
}

/**
 * Token-free read model for the invitee-facing list. The acceptance token is
 * intentionally absent from the port so transport code cannot leak it.
 */
export interface PendingInvitationRecord {
  id: string
  kind: InvitationKind
  email: string
  organizationId: string | null
  organizationName: string | null
  membershipIntent: InvitationMembershipIntent
  role: string
  status: string
  expiresAt: Date
  createdAt: Date
  inviterName: string | null
  inviterEmail: string | null
  grants: readonly PendingInvitationGrantRecord[]
}

export interface InvitationReadRepository {
  listPendingForEmail(email: string): Promise<readonly PendingInvitationRecord[]>
}

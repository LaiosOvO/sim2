import type { OrganizationRosterWorkspacePermissionV1 } from '@sim/api-contracts/organizations'

export interface OrganizationRosterMemberRecord {
  memberId: string
  userId: string
  role: string
  createdAt: Date
  name: string
  email: string
  image: string | null
}

export interface OrganizationRosterWorkspaceRecord {
  id: string
  name: string
}

export interface OrganizationRosterPermissionRecord {
  userId: string
  userName: string
  userEmail: string
  userImage: string | null
  workspaceId: string
  permission: OrganizationRosterWorkspacePermissionV1
  createdAt: Date
}

export interface OrganizationRosterInvitationRecord {
  id: string
  email: string
  role: string
  kind: 'organization' | 'workspace'
  membershipIntent: 'internal' | 'external'
  createdAt: Date
  expiresAt: Date
  inviteeName: string | null
  inviteeImage: string | null
}

export interface OrganizationRosterInvitationGrantRecord {
  invitationId: string
  workspaceId: string
  permission: OrganizationRosterWorkspacePermissionV1
}

export interface OrganizationAdminRosterSnapshot {
  members: OrganizationRosterMemberRecord[]
  workspaces: OrganizationRosterWorkspaceRecord[]
  permissions: OrganizationRosterPermissionRecord[]
  pendingInvitations: OrganizationRosterInvitationRecord[]
  invitationGrants: OrganizationRosterInvitationGrantRecord[]
}

export interface OrganizationRosterReadRepository {
  listMembers(organizationId: string): Promise<OrganizationRosterMemberRecord[]>
  loadAdminSnapshot(organizationId: string): Promise<OrganizationAdminRosterSnapshot>
}

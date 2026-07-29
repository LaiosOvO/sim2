import { db } from '@sim/db'
import {
  invitation,
  invitationWorkspaceGrant,
  member,
  permissions,
  user,
  workspace,
} from '@sim/db/schema'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import type {
  OrganizationRosterMemberRecord,
  OrganizationRosterReadRepository,
} from '@/modules/organizations'

function listMembers(organizationId: string): Promise<OrganizationRosterMemberRecord[]> {
  return db
    .select({
      memberId: member.id,
      userId: member.userId,
      role: member.role,
      createdAt: member.createdAt,
      name: user.name,
      email: user.email,
      image: user.image,
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.organizationId, organizationId))
}

export function createDrizzleOrganizationRosterReadRepository(): OrganizationRosterReadRepository {
  return {
    listMembers,
    async loadAdminSnapshot(organizationId) {
      const [members, workspaces, pendingInvitations] = await Promise.all([
        listMembers(organizationId),
        db
          .select({ id: workspace.id, name: workspace.name })
          .from(workspace)
          .where(and(eq(workspace.organizationId, organizationId), isNull(workspace.archivedAt))),
        db
          .select({
            id: invitation.id,
            email: invitation.email,
            role: invitation.role,
            kind: invitation.kind,
            membershipIntent: invitation.membershipIntent,
            createdAt: invitation.createdAt,
            expiresAt: invitation.expiresAt,
            inviteeName: user.name,
            inviteeImage: user.image,
          })
          .from(invitation)
          .leftJoin(user, sql`lower(${user.email}) = lower(${invitation.email})`)
          .where(
            and(eq(invitation.organizationId, organizationId), eq(invitation.status, 'pending'))
          ),
      ])
      const workspaceIds = workspaces.map((workspace) => workspace.id)
      const invitationIds = pendingInvitations.map((invitation) => invitation.id)
      const [permissionRows, invitationGrants] = await Promise.all([
        workspaceIds.length > 0
          ? db
              .select({
                userId: user.id,
                userName: user.name,
                userEmail: user.email,
                userImage: user.image,
                workspaceId: permissions.entityId,
                permission: permissions.permissionType,
                createdAt: permissions.createdAt,
              })
              .from(permissions)
              .innerJoin(user, eq(permissions.userId, user.id))
              .where(
                and(
                  eq(permissions.entityType, 'workspace'),
                  inArray(permissions.entityId, workspaceIds)
                )
              )
          : [],
        invitationIds.length > 0 && workspaceIds.length > 0
          ? db
              .select({
                invitationId: invitationWorkspaceGrant.invitationId,
                workspaceId: invitationWorkspaceGrant.workspaceId,
                permission: invitationWorkspaceGrant.permission,
              })
              .from(invitationWorkspaceGrant)
              .where(
                and(
                  inArray(invitationWorkspaceGrant.invitationId, invitationIds),
                  inArray(invitationWorkspaceGrant.workspaceId, workspaceIds)
                )
              )
          : [],
      ])
      return {
        members,
        workspaces,
        permissions: permissionRows,
        pendingInvitations,
        invitationGrants,
      }
    },
  }
}

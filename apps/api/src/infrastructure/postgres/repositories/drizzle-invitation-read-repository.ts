import { db } from '@sim/db'
import {
  invitation,
  invitationWorkspaceGrant,
  member,
  organization,
  permissions,
  user,
  workspace,
} from '@sim/db/schema'
import { isOrgAdminRole } from '@sim/platform-authz/workspace'
import { normalizeEmail } from '@sim/utils/string'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import type {
  InvitationReadRepository,
  PendingInvitationGrantRecord,
  WorkspaceInvitationReadRepository,
} from '@/modules/invitations/ports/invitation-read-repository'

/**
 * PostgreSQL invitation read adapter. The base rows and grants are fetched in
 * two batches; no token column is selected and no per-invitation query occurs.
 */
export function createDrizzleInvitationReadRepository(): InvitationReadRepository &
  WorkspaceInvitationReadRepository {
  return {
    async listPendingForEmail(email) {
      const rows = await db
        .select({
          id: invitation.id,
          kind: invitation.kind,
          email: invitation.email,
          organizationId: invitation.organizationId,
          organizationName: organization.name,
          membershipIntent: invitation.membershipIntent,
          role: invitation.role,
          status: invitation.status,
          expiresAt: invitation.expiresAt,
          createdAt: invitation.createdAt,
          inviterName: user.name,
          inviterEmail: user.email,
        })
        .from(invitation)
        .leftJoin(organization, eq(organization.id, invitation.organizationId))
        .innerJoin(user, eq(user.id, invitation.inviterId))
        .where(
          and(
            sql`lower(${invitation.email}) = ${normalizeEmail(email)}`,
            eq(invitation.status, 'pending'),
            sql`${invitation.expiresAt} > now()`
          )
        )
        .orderBy(invitation.createdAt)

      if (rows.length === 0) return []

      const grants = await db
        .select({
          invitationId: invitationWorkspaceGrant.invitationId,
          workspaceId: invitationWorkspaceGrant.workspaceId,
          workspaceName: workspace.name,
          permission: invitationWorkspaceGrant.permission,
        })
        .from(invitationWorkspaceGrant)
        .leftJoin(workspace, eq(workspace.id, invitationWorkspaceGrant.workspaceId))
        .where(
          inArray(
            invitationWorkspaceGrant.invitationId,
            rows.map((row) => row.id)
          )
        )

      const grantsByInvitation = new Map<string, PendingInvitationGrantRecord[]>()
      for (const grant of grants) {
        const records = grantsByInvitation.get(grant.invitationId) ?? []
        records.push({
          workspaceId: grant.workspaceId,
          workspaceName: grant.workspaceName,
          permission: grant.permission,
        })
        grantsByInvitation.set(grant.invitationId, records)
      }

      return rows.map((row) => ({
        ...row,
        grants: grantsByInvitation.get(row.id) ?? [],
      }))
    },

    async listForAccessibleWorkspaces(userId) {
      const explicitRows = await db
        .select({ workspaceId: workspace.id })
        .from(permissions)
        .innerJoin(workspace, eq(permissions.entityId, workspace.id))
        .where(
          and(
            eq(permissions.userId, userId),
            eq(permissions.entityType, 'workspace'),
            isNull(workspace.archivedAt)
          )
        )

      const [membership] = await db
        .select({
          organizationId: member.organizationId,
          role: member.role,
        })
        .from(member)
        .where(eq(member.userId, userId))
        .limit(1)

      const derivedRows =
        membership && isOrgAdminRole(membership.role)
          ? await db
              .select({ workspaceId: workspace.id })
              .from(workspace)
              .where(
                and(
                  eq(workspace.organizationId, membership.organizationId),
                  isNull(workspace.archivedAt)
                )
              )
          : []

      const workspaceIds = [
        ...new Set([
          ...explicitRows.map((row) => row.workspaceId),
          ...derivedRows.map((row) => row.workspaceId),
        ]),
      ]
      if (workspaceIds.length === 0) return []

      return db
        .select({
          id: invitation.id,
          kind: invitation.kind,
          email: invitation.email,
          token: invitation.token,
          status: invitation.status,
          expiresAt: invitation.expiresAt,
          createdAt: invitation.createdAt,
          updatedAt: invitation.updatedAt,
          organizationId: invitation.organizationId,
          membershipIntent: invitation.membershipIntent,
          inviterId: invitation.inviterId,
          workspaceId: invitationWorkspaceGrant.workspaceId,
          permission: invitationWorkspaceGrant.permission,
        })
        .from(invitationWorkspaceGrant)
        .innerJoin(invitation, eq(invitation.id, invitationWorkspaceGrant.invitationId))
        .where(inArray(invitationWorkspaceGrant.workspaceId, workspaceIds))
    },
  }
}

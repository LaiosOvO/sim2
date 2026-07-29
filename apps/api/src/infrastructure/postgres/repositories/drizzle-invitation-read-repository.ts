import { db } from '@sim/db'
import { invitation, invitationWorkspaceGrant, organization, user, workspace } from '@sim/db/schema'
import { normalizeEmail } from '@sim/utils/string'
import { and, eq, inArray, sql } from 'drizzle-orm'
import type {
  InvitationReadRepository,
  PendingInvitationGrantRecord,
} from '@/modules/invitations/ports/invitation-read-repository'

/**
 * PostgreSQL invitation read adapter. The base rows and grants are fetched in
 * two batches; no token column is selected and no per-invitation query occurs.
 */
export function createDrizzleInvitationReadRepository(): InvitationReadRepository {
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
  }
}

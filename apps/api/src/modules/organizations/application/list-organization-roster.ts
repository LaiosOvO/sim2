import type { AuthenticatedRequestContext } from '@sim/api-contracts/auth'
import {
  type GetOrganizationRosterResponseV1,
  getOrganizationRosterResponseV1Schema,
  type OrganizationRosterMemberV1,
  type OrganizationRosterWorkspaceAccessV1,
} from '@sim/api-contracts/organizations'
import type { RequestAccessResolver } from '@sim/auth/authorization'
import { createLogger } from '@sim/logger'
import type { OrganizationInvitationHousekeeping } from '@/modules/organizations/ports/organization-invitation-housekeeping'
import type {
  OrganizationAdminRosterSnapshot,
  OrganizationRosterMemberRecord,
  OrganizationRosterReadRepository,
} from '@/modules/organizations/ports/organization-roster-read-repository'

const logger = createLogger('OrganizationRosterUseCase')

export type ListOrganizationRosterResult =
  | { ok: true; value: GetOrganizationRosterResponseV1 }
  | { ok: false; reason: 'membership-required' }

export interface ListOrganizationRosterUseCase {
  execute(
    context: AuthenticatedRequestContext,
    organizationId: string
  ): Promise<ListOrganizationRosterResult>
}

export interface ListOrganizationRosterDependencies {
  access: RequestAccessResolver
  housekeeping: OrganizationInvitationHousekeeping
  repository: OrganizationRosterReadRepository
}

function memberProjection(record: OrganizationRosterMemberRecord): OrganizationRosterMemberV1 {
  return {
    memberId: record.memberId,
    userId: record.userId,
    role: record.role === 'owner' ? 'owner' : record.role === 'admin' ? 'admin' : 'member',
    createdAt: record.createdAt.toISOString(),
    name: record.name,
    email: record.email,
    image: record.image,
    workspaces: [],
  }
}

function adminProjection(
  snapshot: OrganizationAdminRosterSnapshot
): GetOrganizationRosterResponseV1 {
  const members = snapshot.members.map(memberProjection)
  const memberUserIds = new Set(members.map((member) => member.userId))
  const workspaceNameById = new Map(
    snapshot.workspaces.map((workspace) => [workspace.id, workspace.name])
  )
  const permissionsByUser = new Map<string, OrganizationRosterWorkspaceAccessV1[]>()
  const externalMembersByUser = new Map<string, OrganizationRosterMemberV1>()

  for (const permission of snapshot.permissions) {
    const workspaceAccess = {
      workspaceId: permission.workspaceId,
      workspaceName: workspaceNameById.get(permission.workspaceId) ?? 'Workspace',
      permission: permission.permission,
    }
    if (memberUserIds.has(permission.userId)) {
      const list = permissionsByUser.get(permission.userId) ?? []
      list.push(workspaceAccess)
      permissionsByUser.set(permission.userId, list)
      continue
    }

    const existing = externalMembersByUser.get(permission.userId)
    if (existing) {
      existing.workspaces.push(workspaceAccess)
      if (permission.createdAt < new Date(existing.createdAt)) {
        existing.createdAt = permission.createdAt.toISOString()
      }
      continue
    }
    externalMembersByUser.set(permission.userId, {
      memberId: `external-${permission.userId}`,
      userId: permission.userId,
      role: 'external',
      createdAt: permission.createdAt.toISOString(),
      name: permission.userName,
      email: permission.userEmail,
      image: permission.userImage,
      workspaces: [workspaceAccess],
    })
  }

  const membersWithWorkspaceAccess = members.map((member) => ({
    ...member,
    workspaces:
      member.role === 'owner' || member.role === 'admin'
        ? snapshot.workspaces.map((workspace) => ({
            workspaceId: workspace.id,
            workspaceName: workspace.name,
            permission: 'admin' as const,
          }))
        : (permissionsByUser.get(member.userId) ?? []),
  }))

  const grantsByInvitation = new Map<string, OrganizationRosterWorkspaceAccessV1[]>()
  for (const grant of snapshot.invitationGrants) {
    const list = grantsByInvitation.get(grant.invitationId) ?? []
    list.push({
      workspaceId: grant.workspaceId,
      workspaceName: workspaceNameById.get(grant.workspaceId) ?? 'Workspace',
      permission: grant.permission,
    })
    grantsByInvitation.set(grant.invitationId, list)
  }

  return getOrganizationRosterResponseV1Schema.parse({
    success: true,
    data: {
      members: [...membersWithWorkspaceAccess, ...externalMembersByUser.values()],
      pendingInvitations: snapshot.pendingInvitations.map((invitation) => ({
        id: invitation.id,
        email: invitation.email,
        role: invitation.membershipIntent === 'external' ? 'external' : invitation.role,
        kind: invitation.kind,
        membershipIntent: invitation.membershipIntent,
        createdAt: invitation.createdAt.toISOString(),
        expiresAt: invitation.expiresAt.toISOString(),
        inviteeName: invitation.inviteeName,
        inviteeImage: invitation.inviteeImage,
        workspaces: grantsByInvitation.get(invitation.id) ?? [],
      })),
      workspaces: snapshot.workspaces,
    },
  })
}

export function createListOrganizationRosterUseCase(
  dependencies: ListOrganizationRosterDependencies
): ListOrganizationRosterUseCase {
  return {
    async execute(context, organizationId) {
      if (context.actor.type !== 'user') return { ok: false, reason: 'membership-required' }
      const role = await dependencies.access.organizationRole(context.actor.id, organizationId)
      if (!role) return { ok: false, reason: 'membership-required' }

      if (role !== 'owner' && role !== 'admin') {
        const members = await dependencies.repository.listMembers(organizationId)
        return {
          ok: true,
          value: getOrganizationRosterResponseV1Schema.parse({
            success: true,
            data: {
              members: members.map(memberProjection),
              pendingInvitations: [],
              workspaces: [],
            },
          }),
        }
      }

      try {
        await dependencies.housekeeping.expireStalePending(organizationId)
      } catch (error) {
        // Compatibility: stale-invitation cleanup is best-effort and cannot fail this read.
        logger.warn('Failed to expire stale organization invitations before roster read', {
          error,
          organizationId,
        })
      }
      return {
        ok: true,
        value: adminProjection(await dependencies.repository.loadAdminSnapshot(organizationId)),
      }
    },
  }
}

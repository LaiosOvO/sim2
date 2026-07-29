import { db } from '@sim/db'
import {
  permissionGroup,
  permissionGroupMember,
  permissionGroupWorkspace,
  workspace,
} from '@sim/db/schema'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import type { UserPermissionGroupReadRepository } from '@/modules/permission-groups'

export function createDrizzleUserPermissionGroupReadRepository(): UserPermissionGroupReadRepository {
  return {
    async findActiveWorkspace(workspaceId) {
      const [record] = await db
        .select({ organizationId: workspace.organizationId })
        .from(workspace)
        .where(and(eq(workspace.id, workspaceId), isNull(workspace.archivedAt)))
        .limit(1)
      return record ?? null
    },
    async resolveForUser(userId, organizationId, workspaceId) {
      const rows = await db
        .select({
          id: permissionGroup.id,
          name: permissionGroup.name,
          config: permissionGroup.config,
          isMember: sql<boolean>`exists (
            select 1 from ${permissionGroupMember}
            where ${permissionGroupMember.permissionGroupId} = ${permissionGroup.id}
              and ${permissionGroupMember.userId} = ${userId}
          )`,
          hasMembers: sql<boolean>`exists (
            select 1 from ${permissionGroupMember}
            where ${permissionGroupMember.permissionGroupId} = ${permissionGroup.id}
          )`,
        })
        .from(permissionGroup)
        .innerJoin(
          permissionGroupWorkspace,
          and(
            eq(permissionGroupWorkspace.permissionGroupId, permissionGroup.id),
            eq(permissionGroupWorkspace.workspaceId, workspaceId)
          )
        )
        .where(
          and(
            eq(permissionGroup.organizationId, organizationId),
            eq(permissionGroup.isDefault, false)
          )
        )
        .orderBy(asc(permissionGroup.createdAt), asc(permissionGroup.id))

      const winner = rows.find((row) => row.isMember) ?? rows.find((row) => !row.hasMembers)
      if (winner) {
        return {
          permissionGroupId: winner.id,
          groupName: winner.name,
          config: winner.config,
        }
      }

      const [defaultGroup] = await db
        .select({
          permissionGroupId: permissionGroup.id,
          groupName: permissionGroup.name,
          config: permissionGroup.config,
        })
        .from(permissionGroup)
        .where(
          and(
            eq(permissionGroup.organizationId, organizationId),
            eq(permissionGroup.isDefault, true)
          )
        )
        .limit(1)
      return defaultGroup ?? null
    },
  }
}

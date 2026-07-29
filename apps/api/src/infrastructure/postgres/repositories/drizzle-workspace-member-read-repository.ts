import { db } from '@sim/db'
import { permissions, user, workspace } from '@sim/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import type { WorkspaceMemberReadRepository } from '@/modules/workspaces/ports/workspace-member-read-repository'

/**
 * Returns explicit workspace members only. Organization-admin inheritance is
 * an authorization concern and must not silently add derived principals to the
 * lightweight member display list.
 */
export function createDrizzleWorkspaceMemberReadRepository(): WorkspaceMemberReadRepository {
  return {
    async listActiveMembers(workspaceId) {
      return db
        .select({
          userId: user.id,
          name: user.name,
          image: user.image,
        })
        .from(permissions)
        .innerJoin(user, eq(permissions.userId, user.id))
        .innerJoin(workspace, eq(permissions.entityId, workspace.id))
        .where(
          and(
            eq(permissions.entityType, 'workspace'),
            eq(permissions.entityId, workspaceId),
            isNull(workspace.archivedAt)
          )
        )
    },
  }
}

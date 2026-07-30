import { db } from '@sim/db'
import { workspace } from '@sim/db/schema'
import { resolveEffectiveWorkspacePermission } from '@sim/platform-authz/workspace'
import { and, eq, isNull } from 'drizzle-orm'
import type { WorkspaceForkCurrentAccessReader } from '@/modules/workspace-forking'

export function createDrizzleWorkspaceForkCurrentAccessReader(): WorkspaceForkCurrentAccessReader {
  return {
    async findActiveForViewer(workspaceId, viewerId) {
      const [record] = await db
        .select({ organizationId: workspace.organizationId })
        .from(workspace)
        .where(and(eq(workspace.id, workspaceId), isNull(workspace.archivedAt)))
        .limit(1)
      if (!record) return null

      const permission = await resolveEffectiveWorkspacePermission(
        viewerId,
        workspaceId,
        record.organizationId
      )
      return {
        organizationId: record.organizationId,
        permission,
      }
    },
  }
}

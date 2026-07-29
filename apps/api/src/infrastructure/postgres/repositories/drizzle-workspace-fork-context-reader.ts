import { db } from '@sim/db'
import { workspace } from '@sim/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import type { WorkspaceForkContextReader } from '@/modules/workspace-forking'

export function createDrizzleWorkspaceForkContextReader(): WorkspaceForkContextReader {
  return {
    async findActive(workspaceId) {
      const [record] = await db
        .select({ organizationId: workspace.organizationId })
        .from(workspace)
        .where(and(eq(workspace.id, workspaceId), isNull(workspace.archivedAt)))
        .limit(1)
      return record ?? null
    },
  }
}

import { db } from '@sim/db'
import { workspace } from '@sim/db/schema'
import { asc, eq } from 'drizzle-orm'
import type { OrganizationWorkspaceReadRepository } from '@/modules/organizations'

export function createDrizzleOrganizationWorkspaceReadRepository(): OrganizationWorkspaceReadRepository {
  return {
    async listByOrganization(organizationId) {
      return db
        .select({
          id: workspace.id,
          name: workspace.name,
        })
        .from(workspace)
        .where(eq(workspace.organizationId, organizationId))
        .orderBy(asc(workspace.name))
    },
  }
}

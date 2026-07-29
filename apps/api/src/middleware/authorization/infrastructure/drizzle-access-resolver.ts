import type { RequestAccessResolver } from '@sim/auth/authorization'
import { db } from '@sim/db'
import { member, workspace } from '@sim/db/schema'
import { getActiveWorkflowContext } from '@sim/platform-authz/workflow'
import { resolveEffectiveWorkspacePermission } from '@sim/platform-authz/workspace'
import { and, eq, isNull } from 'drizzle-orm'

export function createDrizzleAccessResolver(): RequestAccessResolver {
  return {
    async workspacePermission(actorId, workspaceId) {
      const [record] = await db
        .select({ organizationId: workspace.organizationId })
        .from(workspace)
        .where(and(eq(workspace.id, workspaceId), isNull(workspace.archivedAt)))
        .limit(1)
      if (!record) return null
      return resolveEffectiveWorkspacePermission(actorId, workspaceId, record.organizationId)
    },
    async organizationRole(actorId, organizationId) {
      const [record] = await db
        .select({ role: member.role })
        .from(member)
        .where(and(eq(member.userId, actorId), eq(member.organizationId, organizationId)))
        .limit(1)
      return record?.role ?? null
    },
    async workflow(workflowId) {
      const record = await getActiveWorkflowContext(workflowId)
      return record
        ? {
            workflowId: record.workflow.id,
            workspaceId: record.workspaceId,
            organizationId: record.workspaceOrganizationId,
          }
        : null
    },
  }
}

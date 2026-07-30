import { db } from '@sim/db'
import { workflow } from '@sim/db/schema'
import { eq } from 'drizzle-orm'
import type { WorkflowReadScopeReader } from '@/modules/execution/read'

/**
 * Narrow lookup used before canonical authorization so missing workflows,
 * historical personal workflows, and workspace-scoped credentials retain
 * their frozen wire precedence.
 */
export function createDrizzleWorkflowReadScopeReader(): WorkflowReadScopeReader {
  return {
    async readScope(workflowId) {
      const [row] = await db
        .select({ workspaceId: workflow.workspaceId })
        .from(workflow)
        .where(eq(workflow.id, workflowId))
        .limit(1)
      return row ?? null
    },
  }
}

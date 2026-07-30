import { db } from '@sim/db'
import { workspace, workspaceForkPromoteRun } from '@sim/db/schema'
import {
  resolveAccessibleWorkspaceIds,
  type WorkspacePermissionSubject,
} from '@sim/platform-authz/workspace'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type {
  WorkspaceForkLineageReader,
  WorkspaceForkLineageSnapshot,
} from '@/modules/workspace-forking'

const parentWorkspace = alias(workspace, 'fork_parent_workspace')
const sourceWorkspace = alias(workspace, 'fork_promote_source_workspace')

export function createDrizzleWorkspaceForkLineageReader(): WorkspaceForkLineageReader {
  return {
    async readForViewer(workspaceId, viewerId) {
      const [parentRows, childRows, runRows] = await Promise.all([
        db
          .select({
            id: parentWorkspace.id,
            name: parentWorkspace.name,
            organizationId: parentWorkspace.organizationId,
          })
          .from(workspace)
          .leftJoin(
            parentWorkspace,
            and(
              eq(parentWorkspace.id, workspace.forkedFromWorkspaceId),
              isNull(parentWorkspace.archivedAt)
            )
          )
          .where(and(eq(workspace.id, workspaceId), isNull(workspace.archivedAt)))
          .limit(1),
        db
          .select({
            id: workspace.id,
            name: workspace.name,
            organizationId: workspace.organizationId,
            createdAt: workspace.createdAt,
          })
          .from(workspace)
          .where(
            and(eq(workspace.forkedFromWorkspaceId, workspaceId), isNull(workspace.archivedAt))
          )
          .orderBy(desc(workspace.createdAt)),
        db
          .select({
            sourceWorkspaceId: workspaceForkPromoteRun.sourceWorkspaceId,
            sourceWorkspaceName: sourceWorkspace.name,
            direction: workspaceForkPromoteRun.direction,
          })
          .from(workspaceForkPromoteRun)
          .leftJoin(
            sourceWorkspace,
            eq(sourceWorkspace.id, workspaceForkPromoteRun.sourceWorkspaceId)
          )
          .where(eq(workspaceForkPromoteRun.targetWorkspaceId, workspaceId))
          .orderBy(desc(workspaceForkPromoteRun.createdAt))
          .limit(1),
      ])

      const rawParent = parentRows[0]
      const parent =
        rawParent && rawParent.id !== null && rawParent.name !== null
          ? {
              id: rawParent.id,
              name: rawParent.name,
              organizationId: rawParent.organizationId,
            }
          : null
      const subjects: WorkspacePermissionSubject[] = [
        ...(parent ? [parent] : []),
        ...childRows.map((child) => ({
          id: child.id,
          organizationId: child.organizationId,
        })),
      ]
      const accessibleIds = await resolveAccessibleWorkspaceIds(viewerId, subjects)
      const run = runRows[0]

      return {
        parent: parent
          ? {
              ...parent,
              viewerAccessible: accessibleIds.has(parent.id),
            }
          : null,
        children: childRows.map((child) => ({
          id: child.id,
          name: child.name,
          organizationId: child.organizationId,
          viewerAccessible: accessibleIds.has(child.id),
          createdAt: child.createdAt.toISOString(),
        })),
        undoableRun: run
          ? {
              otherWorkspaceId: run.sourceWorkspaceId,
              otherName: run.sourceWorkspaceName ?? 'workspace',
              direction: run.direction,
            }
          : null,
      } satisfies WorkspaceForkLineageSnapshot
    },
  }
}

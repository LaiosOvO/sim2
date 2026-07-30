import { dbReplica } from '@sim/db'
import { copilotChats, folder, workflow, workspaceFiles } from '@sim/db/schema'
import { and, asc, desc, eq, isNull } from 'drizzle-orm'
import type { WorkspaceBootstrapReadRepository } from '@/modules/workspace-bootstrap/workspace-bootstrap-module'

export function createDrizzleWorkspaceBootstrapReadRepository(): WorkspaceBootstrapReadRepository {
  return {
    async load(workspaceId, userId) {
      const [workflows, folders, chats, files] = await Promise.all([
        dbReplica
          .select({
            id: workflow.id,
            name: workflow.name,
            description: workflow.description,
            folderId: workflow.folderId,
            updatedAt: workflow.updatedAt,
            isDeployed: workflow.isDeployed,
          })
          .from(workflow)
          .where(and(eq(workflow.workspaceId, workspaceId), isNull(workflow.archivedAt)))
          .orderBy(asc(workflow.sortOrder), asc(workflow.createdAt), asc(workflow.id)),
        dbReplica
          .select({
            id: folder.id,
            name: folder.name,
            parentId: folder.parentId,
          })
          .from(folder)
          .where(
            and(
              eq(folder.workspaceId, workspaceId),
              eq(folder.resourceType, 'workflow'),
              isNull(folder.deletedAt)
            )
          )
          .orderBy(asc(folder.sortOrder), asc(folder.createdAt), asc(folder.id)),
        dbReplica
          .select({
            id: copilotChats.id,
            title: copilotChats.title,
            updatedAt: copilotChats.updatedAt,
            pinned: copilotChats.pinned,
            activeStreamId: copilotChats.conversationId,
          })
          .from(copilotChats)
          .where(
            and(
              eq(copilotChats.userId, userId),
              eq(copilotChats.workspaceId, workspaceId),
              eq(copilotChats.type, 'mothership'),
              isNull(copilotChats.deletedAt)
            )
          )
          .orderBy(desc(copilotChats.pinned), desc(copilotChats.updatedAt)),
        dbReplica
          .select({
            id: workspaceFiles.id,
            name: workspaceFiles.originalName,
            path: workspaceFiles.key,
            type: workspaceFiles.contentType,
            size: workspaceFiles.size,
            updatedAt: workspaceFiles.updatedAt,
          })
          .from(workspaceFiles)
          .where(
            and(
              eq(workspaceFiles.workspaceId, workspaceId),
              eq(workspaceFiles.context, 'workspace'),
              isNull(workspaceFiles.deletedAt)
            )
          )
          .orderBy(asc(workspaceFiles.uploadedAt), asc(workspaceFiles.id)),
      ])

      return {
        workflows: workflows.map((item) => ({
          ...item,
          updatedAt: item.updatedAt.toISOString(),
        })),
        folders,
        chats: chats.map((item) => ({
          ...item,
          updatedAt: item.updatedAt.toISOString(),
        })),
        files: files.map((item) => ({
          ...item,
          updatedAt: item.updatedAt.toISOString(),
        })),
      }
    },
  }
}

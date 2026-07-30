import { db } from '@sim/db'
import {
  customTools,
  folder,
  knowledgeBase,
  mcpServers,
  skill,
  userTableDefinitions,
  workflow,
  workflowDeploymentVersion,
  workflowMcpServer,
  workspaceFiles,
} from '@sim/db/schema'
import { and, count, eq, exists, isNull, sql } from 'drizzle-orm'
import type {
  WorkspaceForkResourceCatalog,
  WorkspaceForkResourceCatalogReader,
} from '@/modules/workspace-forking/ports/workspace-fork-resource-catalog-reader'

const CANDIDATE_LIMIT = 1000

export function createDrizzleWorkspaceForkResourceCatalogReader(
  database: typeof db = db
): WorkspaceForkResourceCatalogReader {
  return {
    async readCopyable(workspaceId) {
      const [files, tables, knowledgeBases, tools, skills, externalServers, servers, deployed] =
        await Promise.all([
          database
            .select({
              id: workspaceFiles.id,
              label: sql<string>`coalesce(${workspaceFiles.displayName}, ${workspaceFiles.originalName})`,
              folderId: workspaceFiles.folderId,
              folderName: folder.name,
            })
            .from(workspaceFiles)
            .leftJoin(
              folder,
              and(
                eq(workspaceFiles.folderId, folder.id),
                eq(folder.workspaceId, workspaceId),
                eq(folder.resourceType, 'file'),
                isNull(folder.deletedAt)
              )
            )
            .where(
              and(
                eq(workspaceFiles.workspaceId, workspaceId),
                eq(workspaceFiles.context, 'workspace'),
                isNull(workspaceFiles.deletedAt)
              )
            )
            .limit(CANDIDATE_LIMIT),
          database
            .select({ id: userTableDefinitions.id, label: userTableDefinitions.name })
            .from(userTableDefinitions)
            .where(
              and(
                eq(userTableDefinitions.workspaceId, workspaceId),
                isNull(userTableDefinitions.archivedAt)
              )
            )
            .limit(CANDIDATE_LIMIT),
          database
            .select({ id: knowledgeBase.id, label: knowledgeBase.name })
            .from(knowledgeBase)
            .where(and(eq(knowledgeBase.workspaceId, workspaceId), isNull(knowledgeBase.deletedAt)))
            .limit(CANDIDATE_LIMIT),
          database
            .select({ id: customTools.id, label: customTools.title })
            .from(customTools)
            .where(eq(customTools.workspaceId, workspaceId))
            .limit(CANDIDATE_LIMIT),
          database
            .select({ id: skill.id, label: skill.name })
            .from(skill)
            .where(eq(skill.workspaceId, workspaceId))
            .limit(CANDIDATE_LIMIT),
          database
            .select({ id: mcpServers.id, label: mcpServers.name })
            .from(mcpServers)
            .where(and(eq(mcpServers.workspaceId, workspaceId), isNull(mcpServers.deletedAt)))
            .limit(CANDIDATE_LIMIT),
          database
            .select({ id: workflowMcpServer.id, label: workflowMcpServer.name })
            .from(workflowMcpServer)
            .where(
              and(
                eq(workflowMcpServer.workspaceId, workspaceId),
                isNull(workflowMcpServer.deletedAt)
              )
            )
            .limit(CANDIDATE_LIMIT),
          database
            .select({ value: count() })
            .from(workflow)
            .where(
              and(
                eq(workflow.workspaceId, workspaceId),
                eq(workflow.isDeployed, true),
                eq(workflow.forkSyncExcluded, false),
                isNull(workflow.archivedAt),
                exists(
                  database
                    .select({ one: sql`1` })
                    .from(workflowDeploymentVersion)
                    .where(
                      and(
                        eq(workflowDeploymentVersion.workflowId, workflow.id),
                        eq(workflowDeploymentVersion.isActive, true)
                      )
                    )
                )
              )
            ),
        ])

      return {
        files,
        tables,
        knowledgeBases,
        customTools: tools,
        skills,
        mcpServers: externalServers,
        workflowMcpServers: servers,
        deployedWorkflowCount: deployed[0]?.value ?? 0,
      } satisfies WorkspaceForkResourceCatalog
    },
  }
}

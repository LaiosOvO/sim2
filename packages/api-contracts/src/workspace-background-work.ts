import { z } from 'zod'

export const workspaceBackgroundWorkParamsV1Schema = z.object({
  id: z.string().min(1),
})

export const workspaceBackgroundWorkQueryV1Schema = z.object({
  cursor: z.string().optional(),
  limit: z
    .string()
    .optional()
    .transform((value) => Math.min(Math.max(Number(value) || 50, 1), 100)),
})

export const workspaceBackgroundWorkNeedsConfigurationV1Schema = z.object({
  workflowName: z.string(),
  blocks: z.array(z.string()).min(1),
})

export const workspaceBackgroundWorkMetadataV1Schema = z
  .object({
    actorName: z.string().optional(),
    childWorkspaceId: z.string().optional(),
    childWorkspaceName: z.string().optional(),
    workflowsCopied: z.number().int().optional(),
    tables: z.number().int().optional(),
    knowledgeBases: z.number().int().optional(),
    files: z.number().int().optional(),
    copied: z.number().int().optional(),
    failed: z.number().int().optional(),
    clearedReferences: z.number().int().optional(),
    clearingFailed: z.boolean().optional(),
    workflowNames: z.array(z.string()).optional(),
    tableNames: z.array(z.string()).optional(),
    knowledgeBaseNames: z.array(z.string()).optional(),
    fileNames: z.array(z.string()).optional(),
    customToolNames: z.array(z.string()).optional(),
    skillNames: z.array(z.string()).optional(),
    mcpServerNames: z.array(z.string()).optional(),
    workflowMcpServerNames: z.array(z.string()).optional(),
    otherWorkspaceId: z.string().optional(),
    otherWorkspaceName: z.string().optional(),
    direction: z.enum(['push', 'pull']).optional(),
    updated: z.number().int().optional(),
    created: z.number().int().optional(),
    archived: z.number().int().optional(),
    redeployed: z.number().int().optional(),
    deployFailed: z.number().int().optional(),
    restored: z.number().int().optional(),
    unarchived: z.number().int().optional(),
    removed: z.number().int().optional(),
    skipped: z.number().int().optional(),
    updatedNames: z.array(z.string()).optional(),
    createdNames: z.array(z.string()).optional(),
    archivedNames: z.array(z.string()).optional(),
    needsConfiguration: z.array(workspaceBackgroundWorkNeedsConfigurationV1Schema).optional(),
    clearedOptional: z.array(workspaceBackgroundWorkNeedsConfigurationV1Schema).optional(),
  })
  .nullable()

export const workspaceBackgroundWorkItemV1Schema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  workflowId: z.string().nullable(),
  kind: z.enum(['deployment_side_effects', 'fork_content_copy', 'fork_sync', 'fork_rollback']),
  status: z.enum(['pending', 'processing', 'completed', 'completed_with_warnings', 'failed']),
  message: z.string().nullable(),
  error: z.string().nullable(),
  metadata: workspaceBackgroundWorkMetadataV1Schema,
  startedAt: z.string(),
  completedAt: z.string().nullable(),
})

export const listWorkspaceBackgroundWorkResponseV1Schema = z.object({
  items: z.array(workspaceBackgroundWorkItemV1Schema),
  nextCursor: z.string().nullable(),
})

export const listWorkspaceBackgroundWorkContractV1 = {
  method: 'GET',
  path: '/api/workspaces/[id]/background-work',
  params: workspaceBackgroundWorkParamsV1Schema,
  query: workspaceBackgroundWorkQueryV1Schema,
  response: {
    mode: 'json',
    schema: listWorkspaceBackgroundWorkResponseV1Schema,
  },
} as const

export type WorkspaceBackgroundWorkParamsV1 = z.infer<typeof workspaceBackgroundWorkParamsV1Schema>
export type WorkspaceBackgroundWorkQueryV1 = z.input<typeof workspaceBackgroundWorkQueryV1Schema>
export type WorkspaceBackgroundWorkMetadataV1 = z.infer<
  typeof workspaceBackgroundWorkMetadataV1Schema
>
export type WorkspaceBackgroundWorkItemV1 = z.infer<typeof workspaceBackgroundWorkItemV1Schema>
export type ListWorkspaceBackgroundWorkResponseV1 = z.infer<
  typeof listWorkspaceBackgroundWorkResponseV1Schema
>

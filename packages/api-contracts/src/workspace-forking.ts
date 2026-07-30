import { z } from 'zod'

export const forkWorkspaceIdParamsV1Schema = z.object({
  id: z.string().min(1),
})

export const getForkAvailabilityResponseV1Schema = z.object({
  available: z.boolean(),
})

export const forkDirectionV1Schema = z.enum(['push', 'pull'])

export const forkLineageNodeV1Schema = z.object({
  id: z.string(),
  name: z.string(),
  organizationId: z.string().nullable(),
  viewerAccessible: z.boolean(),
})

export const forkLineageChildV1Schema = forkLineageNodeV1Schema.extend({
  createdAt: z.iso.datetime(),
})

export const forkLineageUndoableRunV1Schema = z.object({
  otherWorkspaceId: z.string(),
  otherName: z.string(),
  direction: forkDirectionV1Schema,
})

export const getForkLineageResponseV1Schema = z.object({
  workspaceId: z.string(),
  parent: forkLineageNodeV1Schema.nullable(),
  children: z.array(forkLineageChildV1Schema),
  undoableRun: forkLineageUndoableRunV1Schema.nullable(),
})

export const forkCopyableResourceV1Schema = z.object({
  id: z.string(),
  label: z.string(),
})

export const forkCopyableFileV1Schema = forkCopyableResourceV1Schema.extend({
  folderId: z.string().nullable(),
  folderName: z.string().nullable(),
})

export const getForkResourcesResponseV1Schema = z.object({
  files: z.array(forkCopyableFileV1Schema),
  tables: z.array(forkCopyableResourceV1Schema),
  knowledgeBases: z.array(forkCopyableResourceV1Schema),
  customTools: z.array(forkCopyableResourceV1Schema),
  skills: z.array(forkCopyableResourceV1Schema),
  mcpServers: z.array(forkCopyableResourceV1Schema),
  workflowMcpServers: z.array(forkCopyableResourceV1Schema),
  deployedWorkflowCount: z.number().int(),
})

export type ForkWorkspaceIdParamsV1 = z.infer<typeof forkWorkspaceIdParamsV1Schema>
export type ForkDirectionV1 = z.infer<typeof forkDirectionV1Schema>
export type ForkLineageNodeV1 = z.infer<typeof forkLineageNodeV1Schema>
export type ForkLineageChildV1 = z.infer<typeof forkLineageChildV1Schema>
export type ForkLineageUndoableRunV1 = z.infer<typeof forkLineageUndoableRunV1Schema>
export type ForkCopyableResourceV1 = z.infer<typeof forkCopyableResourceV1Schema>
export type ForkCopyableFileV1 = z.infer<typeof forkCopyableFileV1Schema>
export type GetForkAvailabilityResponseV1 = z.infer<typeof getForkAvailabilityResponseV1Schema>
export type GetForkLineageResponseV1 = z.infer<typeof getForkLineageResponseV1Schema>
export type GetForkResourcesResponseV1 = z.infer<typeof getForkResourcesResponseV1Schema>

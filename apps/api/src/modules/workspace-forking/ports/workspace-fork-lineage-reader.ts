import type { GetForkLineageResponseV1 } from '@sim/api-contracts/workspace-forking'

export type WorkspaceForkLineageSnapshot = Omit<GetForkLineageResponseV1, 'workspaceId'>

/**
 * Viewer-specific read model for workspace lineage. Implementations own joins,
 * ordering and batched access projection so application code cannot create N+1
 * permission queries.
 */
export interface WorkspaceForkLineageReader {
  readForViewer(workspaceId: string, viewerId: string): Promise<WorkspaceForkLineageSnapshot>
}

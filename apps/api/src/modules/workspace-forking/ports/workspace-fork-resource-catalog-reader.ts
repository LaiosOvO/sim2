import type { GetForkResourcesResponseV1 } from '@sim/api-contracts/workspace-forking'

export type WorkspaceForkResourceCatalog = GetForkResourcesResponseV1

/**
 * Copyable-resource projection used by the fork creation surface.
 * Implementations own resource filtering, file-folder projection, limits and
 * deployed-workflow counting behind this single read interface.
 */
export interface WorkspaceForkResourceCatalogReader {
  readCopyable(workspaceId: string): Promise<WorkspaceForkResourceCatalog>
}

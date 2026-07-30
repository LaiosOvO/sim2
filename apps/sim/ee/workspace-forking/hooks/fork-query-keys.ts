export type ForkDirection = 'push' | 'pull'

export const forkKeys = {
  all: ['workspace-fork'] as const,
  lineages: () => [...forkKeys.all, 'lineage'] as const,
  lineage: (workspaceId?: string) => [...forkKeys.lineages(), workspaceId ?? ''] as const,
  mappings: () => [...forkKeys.all, 'mapping'] as const,
  mapping: (workspaceId?: string, otherWorkspaceId?: string, direction?: ForkDirection) =>
    [...forkKeys.mappings(), workspaceId ?? '', otherWorkspaceId ?? '', direction ?? ''] as const,
  diffs: () => [...forkKeys.all, 'diff'] as const,
  diff: (workspaceId?: string, otherWorkspaceId?: string, direction?: ForkDirection) =>
    [...forkKeys.diffs(), workspaceId ?? '', otherWorkspaceId ?? '', direction ?? ''] as const,
  resourcesAll: () => [...forkKeys.all, 'resources'] as const,
  resources: (workspaceId?: string) => [...forkKeys.resourcesAll(), workspaceId ?? ''] as const,
}

export const WORKSPACE_FORK_RESOURCES_STALE_TIME = 30 * 1000
export const WORKSPACE_FORK_LINEAGE_STALE_TIME = 30 * 1000
export const WORKSPACE_FORK_MAPPING_STALE_TIME = 15 * 1000
export const WORKSPACE_FORK_DIFF_STALE_TIME = 10 * 1000

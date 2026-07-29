export interface WorkspaceForkContext {
  organizationId: string | null
}

/**
 * Minimal active-workspace projection needed by the forking policy.
 * Authorization is intentionally not hidden in this persistence port.
 */
export interface WorkspaceForkContextReader {
  findActive(workspaceId: string): Promise<WorkspaceForkContext | null>
}

export interface WorkspaceForkCurrentAccess {
  organizationId: string | null
  permission: 'read' | 'write' | 'admin' | null
}

export interface WorkspaceForkCurrentAccessReader {
  findActiveForViewer(
    workspaceId: string,
    viewerId: string
  ): Promise<WorkspaceForkCurrentAccess | null>
}

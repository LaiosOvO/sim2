export interface PermissionGroupWorkspaceContext {
  organizationId: string | null
}

export interface ResolvedUserPermissionGroupRecord {
  permissionGroupId: string
  groupName: string
  config: unknown
}

export interface UserPermissionGroupReadRepository {
  findActiveWorkspace(workspaceId: string): Promise<PermissionGroupWorkspaceContext | null>
  resolveForUser(
    userId: string,
    organizationId: string,
    workspaceId: string
  ): Promise<ResolvedUserPermissionGroupRecord | null>
}

export interface OrganizationWorkspaceRecord {
  id: string
  name: string
}

export interface OrganizationWorkspaceReadRepository {
  listByOrganization(organizationId: string): Promise<readonly OrganizationWorkspaceRecord[]>
}

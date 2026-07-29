export interface OrganizationAccessControlEntitlementReader {
  isEntitled(organizationId: string): Promise<boolean>
}

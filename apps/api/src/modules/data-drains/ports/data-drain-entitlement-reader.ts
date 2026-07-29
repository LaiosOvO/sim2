export interface DataDrainEntitlementReader {
  isEntitled(organizationId: string): Promise<boolean>
}

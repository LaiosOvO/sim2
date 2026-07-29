export interface ForkEntitlementReader {
  isEntitled(organizationId: string): Promise<boolean>
}

export interface OrganizationInvitationHousekeeping {
  expireStalePending(organizationId: string): Promise<void>
}

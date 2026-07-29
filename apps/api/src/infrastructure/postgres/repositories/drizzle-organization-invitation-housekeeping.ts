import { db } from '@sim/db'
import { invitation } from '@sim/db/schema'
import { and, eq, lte } from 'drizzle-orm'
import type { OrganizationInvitationHousekeeping } from '@/modules/organizations'

export function createDrizzleOrganizationInvitationHousekeeping(): OrganizationInvitationHousekeeping {
  return {
    async expireStalePending(organizationId) {
      const now = new Date()
      await db
        .update(invitation)
        .set({ status: 'expired', updatedAt: now })
        .where(
          and(
            eq(invitation.organizationId, organizationId),
            eq(invitation.status, 'pending'),
            lte(invitation.expiresAt, now)
          )
        )
    },
  }
}

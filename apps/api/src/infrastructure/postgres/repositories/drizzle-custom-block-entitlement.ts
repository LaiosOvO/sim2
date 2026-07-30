import { db } from '@sim/db'
import { member, subscription, userStats } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, eq } from 'drizzle-orm'
import type { CustomBlockEntitlement } from '@/modules/custom-blocks/ports/custom-block-policy'

export interface CustomBlockEntitlementOptions {
  billingEnabled: boolean
  accessControlEnabled: boolean
  hosted: boolean
}

const logger = createLogger('CustomBlockEntitlement')

/** Preserves the donor enterprise-plan and owner billing-block semantics. */
export function createDrizzleCustomBlockEntitlement(
  options: CustomBlockEntitlementOptions
): CustomBlockEntitlement {
  return {
    async isEnterprise(organizationId) {
      if (!options.billingEnabled) return true
      if (options.accessControlEnabled && !options.hosted) return true
      try {
        const [owner] = await db
          .select({ userId: member.userId })
          .from(member)
          .where(and(eq(member.organizationId, organizationId), eq(member.role, 'owner')))
          .limit(1)
        if (owner) {
          const [stats] = await db
            .select({ billingBlocked: userStats.billingBlocked })
            .from(userStats)
            .where(eq(userStats.userId, owner.userId))
            .limit(1)
          if (stats?.billingBlocked) return false
        }
        const [record] = await db
          .select({ plan: subscription.plan })
          .from(subscription)
          .where(
            and(eq(subscription.referenceId, organizationId), eq(subscription.status, 'active'))
          )
          .limit(1)
        return record?.plan === 'enterprise'
      } catch (error) {
        logger.error('Failed to check custom-block enterprise entitlement', {
          error,
          organizationId,
        })
        return false
      }
    },
  }
}

import { db } from '@sim/db'
import { member, subscription, userStats } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, eq } from 'drizzle-orm'
import type { DataDrainRuntimeConfig } from '@/config/data-drain-runtime'
import type { DataDrainEntitlementReader } from '@/modules/data-drains'

const logger = createLogger('DataDrainEntitlement')

export function createDrizzleDataDrainEntitlementReader(
  runtime: DataDrainRuntimeConfig
): DataDrainEntitlementReader {
  return {
    async isEntitled(organizationId) {
      if (!runtime.billingEnabled) return true
      if (runtime.accessControlEnabled && !runtime.hosted) return true

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
        } else {
          logger.error('Organization has no owner while checking data-drain entitlement', {
            organizationId,
          })
        }

        const [record] = await db
          .select({ plan: subscription.plan, status: subscription.status })
          .from(subscription)
          .where(
            and(eq(subscription.referenceId, organizationId), eq(subscription.status, 'active'))
          )
          .limit(1)
        return record?.plan === 'enterprise' && record.status === 'active'
      } catch (error) {
        logger.error('Failed to check data-drain entitlement', { error, organizationId })
        return false
      }
    },
  }
}

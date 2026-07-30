import type { ForkingRuntimeConfig } from '@/config/forking-runtime'
import type { ForkEntitlementReader } from '@/modules/workspace-forking/ports/fork-entitlement-reader'
import type { ForkRolloutReader } from '@/modules/workspace-forking/ports/fork-rollout-reader'

export type ForkingAccessDecision =
  | { available: true }
  | {
      available: false
      reason: 'deployment-disabled' | 'enterprise-required'
    }

export interface ForkingAccessDependencies {
  entitlement: ForkEntitlementReader
  rollout: ForkRolloutReader
  runtime: ForkingRuntimeConfig
}

/**
 * Evaluates the shared deployment, entitlement and rollout gate used by all
 * workspace-forking entry points.
 */
export async function evaluateForkingAccess(
  dependencies: ForkingAccessDependencies,
  input: {
    userId: string
    organizationId: string | null
  }
): Promise<ForkingAccessDecision> {
  if (!dependencies.runtime.billingEnabled && !dependencies.runtime.forkingEnabled) {
    return { available: false, reason: 'deployment-disabled' }
  }
  if (dependencies.runtime.billingEnabled) {
    if (!input.organizationId) {
      return { available: false, reason: 'enterprise-required' }
    }
    if (!(await dependencies.entitlement.isEntitled(input.organizationId))) {
      return { available: false, reason: 'enterprise-required' }
    }
  }
  if (
    dependencies.runtime.appConfig.enabled &&
    !(await dependencies.rollout.isEnabled({
      userId: input.userId,
      organizationId: input.organizationId,
    }))
  ) {
    return { available: false, reason: 'deployment-disabled' }
  }
  return { available: true }
}

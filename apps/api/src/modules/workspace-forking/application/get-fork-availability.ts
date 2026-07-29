import type { AuthenticatedRequestContext } from '@sim/api-contracts/auth'
import {
  forkWorkspaceIdParamsV1Schema,
  type GetForkAvailabilityResponseV1,
  getForkAvailabilityResponseV1Schema,
} from '@sim/api-contracts/workspace-forking'
import type { ForkingRuntimeConfig } from '@/config/forking-runtime'
import type { ForkEntitlementReader } from '@/modules/workspace-forking/ports/fork-entitlement-reader'
import type { ForkRolloutReader } from '@/modules/workspace-forking/ports/fork-rollout-reader'
import type { WorkspaceForkContextReader } from '@/modules/workspace-forking/ports/workspace-fork-context-reader'

export type GetForkAvailabilityResult =
  | { ok: true; value: GetForkAvailabilityResponseV1 }
  | { ok: false; reason: 'validation-error'; details: readonly unknown[] }
  | { ok: false; reason: 'workspace-not-found' }

export interface GetForkAvailabilityUseCase {
  execute(
    context: AuthenticatedRequestContext,
    workspaceId: string
  ): Promise<GetForkAvailabilityResult>
}

export interface GetForkAvailabilityDependencies {
  contexts: WorkspaceForkContextReader
  entitlement: ForkEntitlementReader
  rollout: ForkRolloutReader
  runtime: ForkingRuntimeConfig
}

async function resolveAvailability(
  dependencies: GetForkAvailabilityDependencies,
  userId: string,
  organizationId: string | null
): Promise<boolean> {
  try {
    if (!dependencies.runtime.billingEnabled && !dependencies.runtime.forkingEnabled) {
      return false
    }
    if (dependencies.runtime.billingEnabled) {
      if (!organizationId) return false
      if (!(await dependencies.entitlement.isEntitled(organizationId))) return false
    }
    if (
      dependencies.runtime.appConfig.enabled &&
      !(await dependencies.rollout.isEnabled({ userId, organizationId }))
    ) {
      return false
    }
    return true
  } catch {
    // The donor availability helper collapses entitlement, rollout and AppConfig
    // failures into a non-sensitive false verdict.
    return false
  }
}

export function createGetForkAvailabilityUseCase(
  dependencies: GetForkAvailabilityDependencies
): GetForkAvailabilityUseCase {
  return {
    async execute(context, workspaceId) {
      const params = forkWorkspaceIdParamsV1Schema.safeParse({ id: workspaceId })
      if (!params.success) {
        return {
          ok: false,
          reason: 'validation-error',
          details: params.error.issues,
        }
      }

      const workspace = await dependencies.contexts.findActive(params.data.id)
      if (!workspace) return { ok: false, reason: 'workspace-not-found' }

      const available = await resolveAvailability(
        dependencies,
        context.actor.id,
        workspace.organizationId
      )
      return {
        ok: true,
        value: getForkAvailabilityResponseV1Schema.parse({ available }),
      }
    },
  }
}

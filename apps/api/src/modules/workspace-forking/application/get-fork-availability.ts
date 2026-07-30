import type { AuthenticatedRequestContext } from '@sim/api-contracts/auth'
import {
  forkWorkspaceIdParamsV1Schema,
  type GetForkAvailabilityResponseV1,
  getForkAvailabilityResponseV1Schema,
} from '@sim/api-contracts/workspace-forking'
import type { ForkingRuntimeConfig } from '@/config/forking-runtime'
import { evaluateForkingAccess } from '@/modules/workspace-forking/application/evaluate-forking-access'
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

      let available = false
      try {
        const decision = await evaluateForkingAccess(dependencies, {
          userId: context.actor.id,
          organizationId: workspace.organizationId,
        })
        available = decision.available
      } catch {
        /**
         * The donor availability helper collapses entitlement, rollout and
         * AppConfig failures into a non-sensitive false verdict.
         */
        available = false
      }
      return {
        ok: true,
        value: getForkAvailabilityResponseV1Schema.parse({ available }),
      }
    },
  }
}

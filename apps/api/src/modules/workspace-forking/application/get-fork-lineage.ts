import type { AuthenticatedRequestContext } from '@sim/api-contracts/auth'
import {
  forkWorkspaceIdParamsV1Schema,
  type GetForkLineageResponseV1,
  getForkLineageResponseV1Schema,
} from '@sim/api-contracts/workspace-forking'
import type { ForkingRuntimeConfig } from '@/config/forking-runtime'
import { evaluateForkingAccess } from '@/modules/workspace-forking/application/evaluate-forking-access'
import type { ForkEntitlementReader } from '@/modules/workspace-forking/ports/fork-entitlement-reader'
import type { ForkRolloutReader } from '@/modules/workspace-forking/ports/fork-rollout-reader'
import type { WorkspaceForkCurrentAccessReader } from '@/modules/workspace-forking/ports/workspace-fork-current-access-reader'
import type { WorkspaceForkLineageReader } from '@/modules/workspace-forking/ports/workspace-fork-lineage-reader'

export type GetForkLineageResult =
  | { ok: true; value: GetForkLineageResponseV1 }
  | { ok: false; reason: 'validation-error'; details: readonly unknown[] }
  | {
      ok: false
      reason:
        | 'workspace-not-found'
        | 'deployment-disabled'
        | 'enterprise-required'
        | 'admin-required'
    }

export interface GetForkLineageUseCase {
  execute(context: AuthenticatedRequestContext, workspaceId: string): Promise<GetForkLineageResult>
}

export interface GetForkLineageDependencies {
  currentAccess: WorkspaceForkCurrentAccessReader
  lineage: WorkspaceForkLineageReader
  entitlement: ForkEntitlementReader
  rollout: ForkRolloutReader
  runtime: ForkingRuntimeConfig
}

export function createGetForkLineageUseCase(
  dependencies: GetForkLineageDependencies
): GetForkLineageUseCase {
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

      const current = await dependencies.currentAccess.findActiveForViewer(
        params.data.id,
        context.actor.id
      )
      if (!current) return { ok: false, reason: 'workspace-not-found' }

      const decision = await evaluateForkingAccess(dependencies, {
        userId: context.actor.id,
        organizationId: current.organizationId,
      })
      if (!decision.available) return { ok: false, reason: decision.reason }
      if (current.permission !== 'admin') return { ok: false, reason: 'admin-required' }

      const lineage = await dependencies.lineage.readForViewer(params.data.id, context.actor.id)
      return {
        ok: true,
        value: getForkLineageResponseV1Schema.parse({
          workspaceId: params.data.id,
          ...lineage,
        }),
      }
    },
  }
}

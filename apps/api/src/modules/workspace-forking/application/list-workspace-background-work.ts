import type { AuthenticatedRequestContext } from '@sim/api-contracts/auth'
import {
  type ListWorkspaceBackgroundWorkResponseV1,
  listWorkspaceBackgroundWorkResponseV1Schema,
  workspaceBackgroundWorkParamsV1Schema,
  workspaceBackgroundWorkQueryV1Schema,
} from '@sim/api-contracts/workspace-background-work'
import type { ForkingRuntimeConfig } from '@/config/forking-runtime'
import { evaluateForkingAccess } from '@/modules/workspace-forking/application/evaluate-forking-access'
import type { ForkEntitlementReader } from '@/modules/workspace-forking/ports/fork-entitlement-reader'
import type { ForkRolloutReader } from '@/modules/workspace-forking/ports/fork-rollout-reader'
import type { WorkspaceBackgroundWorkReader } from '@/modules/workspace-forking/ports/workspace-background-work-reader'
import type { WorkspaceForkCurrentAccessReader } from '@/modules/workspace-forking/ports/workspace-fork-current-access-reader'

export type ListWorkspaceBackgroundWorkResult =
  | { readonly ok: true; readonly value: ListWorkspaceBackgroundWorkResponseV1 }
  | {
      readonly details: readonly unknown[]
      readonly ok: false
      readonly reason: 'validation-error'
    }
  | {
      readonly ok: false
      readonly reason:
        | 'workspace-not-found'
        | 'deployment-disabled'
        | 'enterprise-required'
        | 'admin-required'
    }

export interface WorkspaceBackgroundWorkRawQuery {
  readonly cursor?: string | readonly string[]
  readonly limit?: string | readonly string[]
}

export interface ListWorkspaceBackgroundWorkUseCase {
  execute(
    context: AuthenticatedRequestContext,
    workspaceId: string,
    query: WorkspaceBackgroundWorkRawQuery
  ): Promise<ListWorkspaceBackgroundWorkResult>
}

export interface ListWorkspaceBackgroundWorkDependencies {
  readonly currentAccess: WorkspaceForkCurrentAccessReader
  readonly entitlement: ForkEntitlementReader
  readonly reader: WorkspaceBackgroundWorkReader
  readonly rollout: ForkRolloutReader
  readonly runtime: ForkingRuntimeConfig
}

export function createListWorkspaceBackgroundWorkUseCase(
  dependencies: ListWorkspaceBackgroundWorkDependencies
): ListWorkspaceBackgroundWorkUseCase {
  return {
    async execute(context, workspaceId, rawQuery) {
      const params = workspaceBackgroundWorkParamsV1Schema.safeParse({ id: workspaceId })
      if (!params.success) {
        return {
          details: params.error.issues,
          ok: false,
          reason: 'validation-error',
        }
      }
      const query = workspaceBackgroundWorkQueryV1Schema.safeParse(rawQuery)
      if (!query.success) {
        return {
          details: query.error.issues,
          ok: false,
          reason: 'validation-error',
        }
      }

      const current = await dependencies.currentAccess.findActiveForViewer(
        params.data.id,
        context.actor.id
      )
      if (!current) return { ok: false, reason: 'workspace-not-found' }

      const decision = await evaluateForkingAccess(dependencies, {
        organizationId: current.organizationId,
        userId: context.actor.id,
      })
      if (!decision.available) return { ok: false, reason: decision.reason }
      if (current.permission !== 'admin') return { ok: false, reason: 'admin-required' }

      const page = await dependencies.reader.listInvolving({
        workspaceId: params.data.id,
        limit: query.data.limit,
        ...(query.data.cursor ? { cursor: query.data.cursor } : {}),
      })
      return {
        ok: true,
        value: listWorkspaceBackgroundWorkResponseV1Schema.parse({
          items: page.records.map((record) => ({
            id: record.id,
            workspaceId: record.workspaceId,
            workflowId: record.workflowId,
            kind: record.kind,
            status: record.status,
            message: record.message,
            error: record.error,
            metadata: record.metadata ?? null,
            startedAt: record.startedAt.toISOString(),
            completedAt: record.completedAt?.toISOString() ?? null,
          })),
          nextCursor: page.nextCursor,
        }),
      }
    },
  }
}

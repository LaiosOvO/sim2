import type { AuthenticatedRequestContext } from '@sim/api-contracts/auth'
import {
  type ListDataDrainRunsResponseV1,
  listDataDrainRunsParamsV1Schema,
  listDataDrainRunsQueryV1Schema,
  listDataDrainRunsResponseV1Schema,
} from '@sim/api-contracts/data-drains'
import type { RequestAccessResolver } from '@sim/auth/authorization'
import type { DataDrainRuntimeConfig } from '@/config/data-drain-runtime'
import type { DataDrainEntitlementReader } from '@/modules/data-drains/ports/data-drain-entitlement-reader'
import type { DataDrainRunReadRepository } from '@/modules/data-drains/ports/data-drain-run-read-repository'

export type ListDataDrainRunsResult =
  | { ok: true; value: ListDataDrainRunsResponseV1 }
  | {
      ok: false
      reason:
        | 'organization-membership-required'
        | 'deployment-disabled'
        | 'enterprise-required'
        | 'organization-admin-required'
        | 'validation-error'
        | 'drain-not-found'
      details?: readonly unknown[]
    }

export interface ListDataDrainRunsInput {
  organizationId: string
  drainId: string
  rawLimit: unknown
}

export interface ListDataDrainRunsUseCase {
  execute(
    context: AuthenticatedRequestContext,
    input: ListDataDrainRunsInput
  ): Promise<ListDataDrainRunsResult>
}

export interface ListDataDrainRunsDependencies {
  access: RequestAccessResolver
  entitlement: DataDrainEntitlementReader
  repository: DataDrainRunReadRepository
  runtime: DataDrainRuntimeConfig
}

export function createListDataDrainRunsUseCase(
  dependencies: ListDataDrainRunsDependencies
): ListDataDrainRunsUseCase {
  return {
    async execute(context, input) {
      if (context.actor.type !== 'user') {
        return { ok: false, reason: 'organization-membership-required' }
      }
      const role = await dependencies.access.organizationRole(
        context.actor.id,
        input.organizationId
      )
      if (!role) return { ok: false, reason: 'organization-membership-required' }

      if (!dependencies.runtime.billingEnabled && !dependencies.runtime.dataDrainsEnabled) {
        return { ok: false, reason: 'deployment-disabled' }
      }
      if (
        dependencies.runtime.billingEnabled &&
        !(await dependencies.entitlement.isEntitled(input.organizationId))
      ) {
        return { ok: false, reason: 'enterprise-required' }
      }
      if (role !== 'owner' && role !== 'admin') {
        return { ok: false, reason: 'organization-admin-required' }
      }

      const params = listDataDrainRunsParamsV1Schema.safeParse(input)
      const query = listDataDrainRunsQueryV1Schema.safeParse({ limit: input.rawLimit })
      if (!params.success || !query.success) {
        return {
          ok: false,
          reason: 'validation-error',
          details: [
            ...(params.success ? [] : params.error.issues),
            ...(query.success ? [] : query.error.issues),
          ],
        }
      }

      const records = await dependencies.repository.listForOrganization(
        params.data.organizationId,
        params.data.drainId,
        query.data.limit
      )
      if (!records) return { ok: false, reason: 'drain-not-found' }

      return {
        ok: true,
        value: listDataDrainRunsResponseV1Schema.parse({
          runs: records.map((record) => ({
            ...record,
            startedAt: record.startedAt.toISOString(),
            finishedAt: record.finishedAt?.toISOString() ?? null,
            locators: record.locators ?? [],
          })),
        }),
      }
    },
  }
}

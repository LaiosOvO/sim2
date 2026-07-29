import type { AuthenticatedRequestContext } from '@sim/api-contracts/auth'
import {
  type ListOrganizationWorkspacesResponseV1,
  listOrganizationWorkspacesResponseV1Schema,
} from '@sim/api-contracts/organizations'
import { authorizeRequestContext, type RequestAccessResolver } from '@sim/auth/authorization'
import type { OrganizationAccessControlEntitlementReader } from '@/modules/organizations/ports/organization-access-control-entitlement-reader'
import type { OrganizationWorkspaceReadRepository } from '@/modules/organizations/ports/organization-workspace-read-repository'

export type ListOrganizationWorkspacesResult =
  | { ok: true; value: ListOrganizationWorkspacesResponseV1 }
  | { ok: false; reason: 'admin-required' | 'enterprise-required' }

export interface ListOrganizationWorkspacesUseCase {
  execute(
    context: AuthenticatedRequestContext,
    organizationId: string
  ): Promise<ListOrganizationWorkspacesResult>
}

export interface ListOrganizationWorkspacesDependencies {
  access: RequestAccessResolver
  entitlement: OrganizationAccessControlEntitlementReader
  repository: OrganizationWorkspaceReadRepository
}

export function createListOrganizationWorkspacesUseCase(
  dependencies: ListOrganizationWorkspacesDependencies
): ListOrganizationWorkspacesUseCase {
  return {
    async execute(context, organizationId) {
      const authorization = await authorizeRequestContext(context, dependencies.access, {
        type: 'organization',
        organizationId,
        access: 'admin',
      })
      if (!authorization.allowed) return { ok: false, reason: 'admin-required' }

      if (!(await dependencies.entitlement.isEntitled(organizationId))) {
        return { ok: false, reason: 'enterprise-required' }
      }

      const workspaces = await dependencies.repository.listByOrganization(organizationId)
      return {
        ok: true,
        value: listOrganizationWorkspacesResponseV1Schema.parse({
          workspaces: workspaces.map((workspace) => ({
            id: workspace.id,
            name: workspace.name,
          })),
        }),
      }
    },
  }
}

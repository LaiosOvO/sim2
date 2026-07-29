import type { AuthenticatedRequestContext } from '@sim/api-contracts/auth'
import {
  type GetUserPermissionGroupResponseV1,
  getUserPermissionGroupResponseV1Schema,
  normalizePermissionGroupConfigV1,
} from '@sim/api-contracts/permission-groups'
import type { RequestAccessResolver } from '@sim/auth/authorization'
import type { OrganizationAccessControlEntitlementReader } from '@/modules/organizations'
import type { UserPermissionGroupReadRepository } from '@/modules/permission-groups/ports/user-permission-group-read-repository'

export type GetUserPermissionGroupResult =
  | { ok: true; value: GetUserPermissionGroupResponseV1 }
  | { ok: false; reason: 'workspace-not-found' | 'workspace-membership-required' }

export interface GetUserPermissionGroupUseCase {
  execute(
    context: AuthenticatedRequestContext,
    workspaceId: string
  ): Promise<GetUserPermissionGroupResult>
}

export interface GetUserPermissionGroupDependencies {
  access: RequestAccessResolver
  entitlement: OrganizationAccessControlEntitlementReader
  repository: UserPermissionGroupReadRepository
}

function emptyResponse(
  organizationId: string | null,
  isOrgAdmin: boolean
): GetUserPermissionGroupResponseV1 {
  return {
    permissionGroupId: null,
    groupName: null,
    config: null,
    entitled: false,
    organizationId,
    isOrgAdmin,
  }
}

export function createGetUserPermissionGroupUseCase(
  dependencies: GetUserPermissionGroupDependencies
): GetUserPermissionGroupUseCase {
  return {
    async execute(context, workspaceId) {
      const workspace = await dependencies.repository.findActiveWorkspace(workspaceId)
      if (!workspace) return { ok: false, reason: 'workspace-not-found' }
      if (context.actor.type !== 'user') {
        return { ok: false, reason: 'workspace-membership-required' }
      }
      const permission = await dependencies.access.workspacePermission(
        context.actor.id,
        workspaceId
      )
      if (!permission) return { ok: false, reason: 'workspace-membership-required' }

      if (!workspace.organizationId) {
        return { ok: true, value: emptyResponse(null, false) }
      }
      const organizationId = workspace.organizationId
      const organizationRole = await dependencies.access.organizationRole(
        context.actor.id,
        organizationId
      )
      const isOrgAdmin = organizationRole === 'owner' || organizationRole === 'admin'
      if (!(await dependencies.entitlement.isEntitled(organizationId))) {
        return { ok: true, value: emptyResponse(organizationId, isOrgAdmin) }
      }

      const resolved = await dependencies.repository.resolveForUser(
        context.actor.id,
        organizationId,
        workspaceId
      )
      return {
        ok: true,
        value: getUserPermissionGroupResponseV1Schema.parse({
          permissionGroupId: resolved?.permissionGroupId ?? null,
          groupName: resolved?.groupName ?? null,
          config: resolved ? normalizePermissionGroupConfigV1(resolved.config) : null,
          entitled: true,
          organizationId,
          isOrgAdmin,
        }),
      }
    },
  }
}

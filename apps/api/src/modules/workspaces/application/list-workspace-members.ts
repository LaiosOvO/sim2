import type { AuthenticatedRequestContext } from '@sim/api-contracts/auth'
import {
  type ListWorkspaceMembersResponseV1,
  listWorkspaceMembersResponseV1Schema,
} from '@sim/api-contracts/workspaces'
import { authorizeRequestContext, type RequestAccessResolver } from '@sim/auth/authorization'
import type { WorkspaceMemberReadRepository } from '@/modules/workspaces/ports/workspace-member-read-repository'

export type ListWorkspaceMembersResult =
  | { ok: true; value: ListWorkspaceMembersResponseV1 }
  | { ok: false; reason: 'not-found-or-access-denied' }

export interface ListWorkspaceMembersUseCase {
  execute(
    context: AuthenticatedRequestContext,
    workspaceId: string
  ): Promise<ListWorkspaceMembersResult>
}

export interface ListWorkspaceMembersDependencies {
  access: RequestAccessResolver
  repository: WorkspaceMemberReadRepository
}

export function createListWorkspaceMembersUseCase(
  dependencies: ListWorkspaceMembersDependencies
): ListWorkspaceMembersUseCase {
  return {
    async execute(context, workspaceId) {
      const authorization = await authorizeRequestContext(context, dependencies.access, {
        type: 'workspace',
        workspaceId,
        access: 'read',
      })
      if (!authorization.allowed) {
        return { ok: false, reason: 'not-found-or-access-denied' }
      }

      const members = await dependencies.repository.listActiveMembers(workspaceId)
      return {
        ok: true,
        value: listWorkspaceMembersResponseV1Schema.parse({ members }),
      }
    },
  }
}

import type { AuthenticatedRequestContext } from '@sim/api-contracts/auth'
import {
  type PersonalProfileResponseV1,
  personalProfileResponseV1Schema,
} from '@sim/api-contracts/workspaces'
import { authorizeRequestContext, type RequestAccessResolver } from '@sim/auth/authorization'
import type { PersonalProfileReader } from '@/modules/identity/ports/personal-profile-reader'

export type GetPersonalProfileResult =
  | { ok: true; value: PersonalProfileResponseV1 }
  | { ok: false; reason: 'workspace-access-denied' }

export interface GetPersonalProfileUseCase {
  execute(
    context: AuthenticatedRequestContext,
    workspaceId: string
  ): Promise<GetPersonalProfileResult>
}

export interface GetPersonalProfileDependencies {
  access: RequestAccessResolver
  profiles: PersonalProfileReader
}

function identifier(identifiers: Readonly<Record<string, string>>, key: string): string | null {
  return identifiers[key] ?? null
}

export function createGetPersonalProfileUseCase(
  dependencies: GetPersonalProfileDependencies
): GetPersonalProfileUseCase {
  return {
    async execute(context, workspaceId) {
      const authorization = await authorizeRequestContext(context, dependencies.access, {
        type: 'workspace',
        workspaceId,
        access: 'read',
      })
      if (!authorization.allowed) {
        return { ok: false, reason: 'workspace-access-denied' }
      }

      const profile = await dependencies.profiles.get(workspaceId, context.actor.id)
      return {
        ok: true,
        value: personalProfileResponseV1Schema.parse({
          account: {
            ...profile.account,
            createdAt: profile.account.createdAt.toISOString(),
          },
          workspace: profile.workspace,
          identities: profile.identities.map((identity) => ({
            id: identity.id,
            providerKey: identity.providerKey,
            tenantKey: identity.tenantKey,
            externalSubjectId: identity.externalSubjectId,
            providerUserId: identifier(identity.identifiers, 'providerUserId'),
            openId: identifier(identity.identifiers, 'openId'),
            unionId: identifier(identity.identifiers, 'unionId'),
            email: identity.email,
            loginName: identity.loginName,
            displayName: identity.displayName,
            status: identity.status,
            lastSyncedAt: identity.lastSyncedAt.toISOString(),
          })),
        }),
      }
    },
  }
}

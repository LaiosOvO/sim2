import type { PersonalIdentityProfileRepository } from '@sim/biz-identity'
import { db } from '@sim/db'
import { externalIdentity, user, workspace } from '@sim/db/schema'
import { and, asc, eq, isNull } from 'drizzle-orm'

function identifiers(input: {
  providerUserId: string | null
  openId: string | null
  unionId: string | null
}): Readonly<Record<string, string>> {
  const aliases = {
    providerUserId: input.providerUserId,
    openId: input.openId,
    unionId: input.unionId,
  }
  return Object.fromEntries(
    Object.entries(aliases).filter((entry): entry is [string, string] => entry[1] !== null)
  )
}

/**
 * Polaris personal identity read adapter. It depends only on the provider-
 * neutral persistence table; Feishu and other provider SDKs stay outside this
 * read path.
 */
export function createDrizzlePersonalIdentityProfileRepository(): PersonalIdentityProfileRepository {
  return {
    async findForUser(workspaceId, userId) {
      const [workspaceRecord] = await db
        .select({
          id: workspace.id,
          name: workspace.name,
          organizationId: workspace.organizationId,
        })
        .from(workspace)
        .where(and(eq(workspace.id, workspaceId), isNull(workspace.archivedAt)))
        .limit(1)
      if (!workspaceRecord) return null

      const [account] = await db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          emailVerified: user.emailVerified,
          image: user.image,
          role: user.role,
          createdAt: user.createdAt,
        })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1)
      if (!account) return null

      const identities = workspaceRecord.organizationId
        ? await db
            .select({
              id: externalIdentity.id,
              providerKey: externalIdentity.providerKey,
              tenantKey: externalIdentity.tenantKey,
              externalSubjectId: externalIdentity.externalSubjectId,
              providerUserId: externalIdentity.providerUserId,
              openId: externalIdentity.openId,
              unionId: externalIdentity.unionId,
              email: externalIdentity.email,
              loginName: externalIdentity.loginName,
              displayName: externalIdentity.displayName,
              status: externalIdentity.status,
              lastSyncedAt: externalIdentity.lastSyncedAt,
            })
            .from(externalIdentity)
            .where(
              and(
                eq(externalIdentity.organizationId, workspaceRecord.organizationId),
                eq(externalIdentity.userId, userId)
              )
            )
            .orderBy(asc(externalIdentity.providerKey), asc(externalIdentity.tenantKey))
        : []

      return {
        account: {
          ...account,
          role: account.role ?? null,
        },
        workspace: workspaceRecord,
        identities: identities.map((identity) => ({
          id: identity.id,
          providerKey: identity.providerKey,
          tenantKey: identity.tenantKey,
          externalSubjectId: identity.externalSubjectId,
          identifiers: identifiers(identity),
          email: identity.email,
          loginName: identity.loginName,
          displayName: identity.displayName,
          status: identity.status,
          lastSyncedAt: identity.lastSyncedAt,
        })),
      }
    },
  }
}

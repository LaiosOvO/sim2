import { db } from '@sim/db'
import { credential, credentialMember, permissions, workspace } from '@sim/db/schema'
import { generateId } from '@sim/utils/id'
import { and, eq, inArray, isNull, notInArray } from 'drizzle-orm'
import type { PersonalEnvironmentCredentialSync } from '@/modules/environment/application/ports'

async function getUserWorkspaceIds(userId: string): Promise<string[]> {
  const [permissionRows, ownedRows] = await Promise.all([
    db
      .select({ workspaceId: workspace.id })
      .from(permissions)
      .innerJoin(
        workspace,
        and(eq(permissions.entityType, 'workspace'), eq(permissions.entityId, workspace.id))
      )
      .where(and(eq(permissions.userId, userId), isNull(workspace.archivedAt))),
    db
      .select({ workspaceId: workspace.id })
      .from(workspace)
      .where(and(eq(workspace.ownerId, userId), isNull(workspace.archivedAt))),
  ])
  return [...new Set([...permissionRows, ...ownedRows].map((row) => row.workspaceId))]
}

export function createPersonalEnvironmentCredentialSync(): PersonalEnvironmentCredentialSync {
  return {
    async synchronize(userId, envKeys) {
      const workspaceIds = await getUserWorkspaceIds(userId)
      const keys = [...new Set(envKeys.filter(Boolean))]
      const now = new Date()

      await Promise.all(
        workspaceIds.map(async (workspaceId) => {
          if (keys.length > 0) {
            await db
              .insert(credential)
              .values(
                keys.map((envKey) => ({
                  id: generateId(),
                  workspaceId,
                  type: 'env_personal' as const,
                  displayName: envKey,
                  envKey,
                  envOwnerUserId: userId,
                  createdBy: userId,
                  createdAt: now,
                  updatedAt: now,
                }))
              )
              .onConflictDoNothing()
          }

          const current =
            keys.length > 0
              ? await db
                  .select({ id: credential.id })
                  .from(credential)
                  .where(
                    and(
                      eq(credential.workspaceId, workspaceId),
                      eq(credential.type, 'env_personal'),
                      eq(credential.envOwnerUserId, userId),
                      inArray(credential.envKey, keys)
                    )
                  )
              : []

          if (current.length > 0) {
            await db
              .insert(credentialMember)
              .values(
                current.map(({ id: credentialId }) => ({
                  id: generateId(),
                  credentialId,
                  userId,
                  role: 'admin' as const,
                  status: 'active' as const,
                  joinedAt: now,
                  invitedBy: userId,
                  createdAt: now,
                  updatedAt: now,
                }))
              )
              .onConflictDoUpdate({
                target: [credentialMember.credentialId, credentialMember.userId],
                set: { role: 'admin', status: 'active', updatedAt: now },
              })
          }

          const environmentCredentials = and(
            eq(credential.workspaceId, workspaceId),
            eq(credential.type, 'env_personal'),
            eq(credential.envOwnerUserId, userId)
          )
          await db
            .delete(credential)
            .where(
              keys.length > 0
                ? and(environmentCredentials, notInArray(credential.envKey, keys))
                : environmentCredentials
            )
        })
      )
    },
  }
}

import type { ApiKeyCredentialVerifier } from '@sim/auth/request-context'
import { db } from '@sim/db'
import { apiKey, user } from '@sim/db/schema'
import { sha256Hex } from '@sim/security/hash'
import { and, eq, isNull, lt, or } from 'drizzle-orm'

const lastUsedStalenessMs = 10 * 60 * 1000

export function createDrizzleApiKeyVerifier(
  now: () => Date = () => new Date()
): ApiKeyCredentialVerifier {
  return {
    async verify(value) {
      if (!value) return { verified: false, reason: 'invalid' }
      try {
        const [record] = await db
          .select({
            id: apiKey.id,
            userId: apiKey.userId,
            workspaceId: apiKey.workspaceId,
            type: apiKey.type,
            expiresAt: apiKey.expiresAt,
            userBanned: user.banned,
            userName: user.name,
            userEmail: user.email,
          })
          .from(apiKey)
          .innerJoin(user, eq(apiKey.userId, user.id))
          .where(eq(apiKey.keyHash, sha256Hex(value)))
          .limit(1)

        if (!record) return { verified: false, reason: 'invalid' }
        if (record.userBanned) return { verified: false, reason: 'revoked' }
        if (record.expiresAt && record.expiresAt.getTime() <= now().getTime()) {
          return { verified: false, reason: 'expired' }
        }
        if (record.type !== 'personal' && record.type !== 'workspace') {
          return { verified: false, reason: 'invalid' }
        }
        if (record.type === 'workspace' && !record.workspaceId) {
          return { verified: false, reason: 'invalid' }
        }

        return {
          verified: true,
          credential: {
            actor: {
              id: record.userId,
              type: 'user',
              name: record.userName,
              email: record.userEmail,
            },
            keyId: record.id,
            keyType: record.type,
            workspaceId: record.workspaceId,
          },
        }
      } catch {
        return { verified: false, reason: 'unavailable' }
      }
    },
    async touch(keyId) {
      try {
        const staleBefore = new Date(now().getTime() - lastUsedStalenessMs)
        await db
          .update(apiKey)
          .set({ lastUsed: now() })
          .where(
            and(eq(apiKey.id, keyId), or(isNull(apiKey.lastUsed), lt(apiKey.lastUsed, staleBefore)))
          )
      } catch {
        // lastUsed is display-only and must not make an authenticated request fail.
      }
    },
  }
}

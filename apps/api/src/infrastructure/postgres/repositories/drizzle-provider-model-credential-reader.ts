import type { RequestAccessResolver } from '@sim/auth/authorization'
import { db } from '@sim/db'
import { workspaceBYOKKeys } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { decrypt } from '@sim/security/encryption'
import { and, asc, eq } from 'drizzle-orm'
import type {
  ProviderModelCredentialReader,
  WorkspaceCredentialProvider,
} from '@/modules/provider-model-discovery/ports/provider-model-credential-reader'

const logger = createLogger('ProviderModelCredentialReader')
const rotationCounters = new Map<string, number>()

function nextIndex(key: string, count: number): number {
  const next = (rotationCounters.get(key) ?? -1) + 1
  rotationCounters.set(key, next)
  return next % count
}

export function createDrizzleProviderModelCredentialReader(options: {
  readonly access: RequestAccessResolver
  readonly encryptionKey: string
}): ProviderModelCredentialReader {
  if (!/^[0-9a-f]{64}$/i.test(options.encryptionKey)) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string')
  }
  const key = Buffer.from(options.encryptionKey, 'hex')

  return {
    async readAuthorized(input) {
      const permission = await options.access.workspacePermission(input.actorId, input.workspaceId)
      if (!permission) return null

      try {
        const records = await db
          .select({
            encryptedApiKey: workspaceBYOKKeys.encryptedApiKey,
            id: workspaceBYOKKeys.id,
          })
          .from(workspaceBYOKKeys)
          .where(
            and(
              eq(workspaceBYOKKeys.workspaceId, input.workspaceId),
              eq(workspaceBYOKKeys.providerId, input.provider)
            )
          )
          .orderBy(asc(workspaceBYOKKeys.createdAt), asc(workspaceBYOKKeys.id))
        if (records.length === 0) return null

        const rotationKey = `${input.workspaceId}:${input.provider}`
        const start = nextIndex(rotationKey, records.length)
        for (let offset = 0; offset < records.length; offset++) {
          const record = records[(start + offset) % records.length]
          try {
            return (await decrypt(record.encryptedApiKey, key)).decrypted
          } catch (error) {
            logger.error('Failed to decrypt provider model credential', {
              error,
              keyId: record.id,
              provider: input.provider,
              workspaceId: input.workspaceId,
            })
          }
        }
        return null
      } catch (error) {
        logger.error('Failed to read provider model credential', {
          error,
          provider: input.provider,
          workspaceId: input.workspaceId,
        })
        return null
      }
    },
  }
}

export type { WorkspaceCredentialProvider }

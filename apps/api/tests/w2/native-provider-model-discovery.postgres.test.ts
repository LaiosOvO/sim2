import type { RequestAccessResolver } from '@sim/auth/authorization'
import { describe, expect, it, vi } from 'vitest'

const disposableDatabaseEnabled =
  process.env.SIM_TEST_DATABASE_DISPOSABLE === '1' && Boolean(process.env.DATABASE_URL)

if (process.env.SIM_REQUIRE_POSTGRES_TEST === '1' && !disposableDatabaseEnabled) {
  throw new Error('PostgreSQL integration requires DATABASE_URL and SIM_TEST_DATABASE_DISPOSABLE=1')
}

describe.runIf(disposableDatabaseEnabled)(
  'provider model credential PostgreSQL integration',
  () => {
    it('authorizes first, isolates tenant/provider rows, and decrypts a usable BYOK key', async () => {
      const [{ db }, { sql }, { encrypt }, { createDrizzleProviderModelCredentialReader }] =
        await Promise.all([
          import('@sim/db'),
          import('drizzle-orm'),
          import('@sim/security/encryption'),
          import('@/infrastructure/postgres/repositories/drizzle-provider-model-credential-reader'),
        ])
      const encryptionKeyHex = '31'.repeat(32)
      const encryptionKey = Buffer.from(encryptionKeyHex, 'hex')
      const target = await encrypt('target-byok-secret', encryptionKey)
      const crossTenant = await encrypt('cross-tenant-secret', encryptionKey)
      const crossProvider = await encrypt('cross-provider-secret', encryptionKey)

      await db.execute(sql.raw('drop table if exists workspace_byok_keys cascade'))
      await db.execute(
        sql.raw(`
        create table workspace_byok_keys (
          id text primary key,
          workspace_id text not null,
          provider_id text not null,
          encrypted_api_key text not null,
          name text,
          created_by text,
          created_at timestamp not null default now(),
          updated_at timestamp not null default now()
        )
      `)
      )
      await db.execute(sql`
        insert into workspace_byok_keys (
          id, workspace_id, provider_id, encrypted_api_key, created_at
        ) values
          ('provider-model-invalid', 'workspace-target', 'baseten', 'invalid', now() - interval '1 day'),
          ('provider-model-target', 'workspace-target', 'baseten', ${target.encrypted}, now()),
          ('provider-model-cross-tenant', 'workspace-other', 'baseten', ${crossTenant.encrypted}, now()),
          ('provider-model-cross-provider', 'workspace-target', 'fireworks', ${crossProvider.encrypted}, now())
      `)

      const workspacePermission = vi.fn(async (actorId: string, workspaceId: string) =>
        actorId === 'actor-allowed' && workspaceId === 'workspace-target' ? ('read' as const) : null
      )
      const access: RequestAccessResolver = {
        workspacePermission,
        async organizationRole() {
          return null
        },
        async workflow() {
          return null
        },
      }
      const reader = createDrizzleProviderModelCredentialReader({
        access,
        encryptionKey: encryptionKeyHex,
      })

      await expect(
        reader.readAuthorized({
          actorId: 'actor-denied',
          provider: 'baseten',
          workspaceId: 'workspace-target',
        })
      ).resolves.toBeNull()
      await expect(
        reader.readAuthorized({
          actorId: 'actor-allowed',
          provider: 'baseten',
          workspaceId: 'workspace-target',
        })
      ).resolves.toBe('target-byok-secret')
      expect(workspacePermission).toHaveBeenCalledWith('actor-allowed', 'workspace-target')
    })
  }
)

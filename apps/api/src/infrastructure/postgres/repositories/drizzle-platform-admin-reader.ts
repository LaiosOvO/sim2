import { dbReplica } from '@sim/db'
import { user } from '@sim/db/schema'
import { eq } from 'drizzle-orm'
import type { PlatformAdminReader } from '@/infrastructure/appconfig/appconfig-fork-rollout-reader'

export function createDrizzlePlatformAdminReader(): PlatformAdminReader {
  return {
    async isPlatformAdmin(userId) {
      const [record] = await dbReplica
        .select({ role: user.role })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1)
      return record?.role === 'admin'
    },
  }
}

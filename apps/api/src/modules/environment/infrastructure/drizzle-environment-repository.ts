import { db } from '@sim/db'
import { environment } from '@sim/db/schema'
import { generateId } from '@sim/utils/id'
import { eq } from 'drizzle-orm'
import type { EnvironmentRepository } from '@/modules/environment/application/ports'

export function createDrizzleEnvironmentRepository(): EnvironmentRepository {
  return {
    async getEncryptedVariables(userId) {
      const rows = await db
        .select({ variables: environment.variables })
        .from(environment)
        .where(eq(environment.userId, userId))
        .limit(1)
      const variables = rows[0]?.variables
      if (!variables || typeof variables !== 'object' || Array.isArray(variables)) return undefined
      return variables as Record<string, string>
    },
    async upsertEncryptedVariables(userId, variables) {
      await db
        .insert(environment)
        .values({
          id: generateId(),
          userId,
          variables,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [environment.userId],
          set: {
            variables,
            updatedAt: new Date(),
          },
        })
    },
  }
}

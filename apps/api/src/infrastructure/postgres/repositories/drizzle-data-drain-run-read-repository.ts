import { db } from '@sim/db'
import { dataDrainRuns, dataDrains } from '@sim/db/schema'
import { and, desc, eq } from 'drizzle-orm'
import type { DataDrainRunReadRepository } from '@/modules/data-drains'

export function createDrizzleDataDrainRunReadRepository(): DataDrainRunReadRepository {
  return {
    async listForOrganization(organizationId, drainId, limit) {
      const [drain] = await db
        .select({ id: dataDrains.id })
        .from(dataDrains)
        .where(and(eq(dataDrains.id, drainId), eq(dataDrains.organizationId, organizationId)))
        .limit(1)
      if (!drain) return null

      return db
        .select({
          id: dataDrainRuns.id,
          drainId: dataDrainRuns.drainId,
          status: dataDrainRuns.status,
          trigger: dataDrainRuns.trigger,
          startedAt: dataDrainRuns.startedAt,
          finishedAt: dataDrainRuns.finishedAt,
          rowsExported: dataDrainRuns.rowsExported,
          bytesWritten: dataDrainRuns.bytesWritten,
          cursorBefore: dataDrainRuns.cursorBefore,
          cursorAfter: dataDrainRuns.cursorAfter,
          error: dataDrainRuns.error,
          locators: dataDrainRuns.locators,
        })
        .from(dataDrainRuns)
        .where(eq(dataDrainRuns.drainId, drainId))
        .orderBy(desc(dataDrainRuns.startedAt))
        .limit(limit)
    },
  }
}

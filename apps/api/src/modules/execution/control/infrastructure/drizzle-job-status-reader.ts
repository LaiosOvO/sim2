import { db } from '@sim/db'
import { asyncJobs } from '@sim/db/schema'
import { eq } from 'drizzle-orm'
import type { JobStatusReader } from '@/modules/execution/control'

export function createDrizzleJobStatusReader(): JobStatusReader {
  return {
    async read(jobId) {
      const [row] = await db
        .select({
          id: asyncJobs.id,
          status: asyncJobs.status,
          metadata: asyncJobs.metadata,
          output: asyncJobs.output,
          error: asyncJobs.error,
        })
        .from(asyncJobs)
        .where(eq(asyncJobs.id, jobId))
        .limit(1)
      if (!row) return null
      if (!['pending', 'processing', 'completed', 'failed'].includes(row.status)) return null
      return {
        id: row.id,
        status: row.status as 'pending' | 'processing' | 'completed' | 'failed',
        metadata:
          row.metadata && typeof row.metadata === 'object'
            ? (row.metadata as Record<string, unknown>)
            : null,
        ...(row.output !== null ? { output: row.output } : {}),
        ...(row.error !== null ? { error: row.error } : {}),
      }
    },
  }
}

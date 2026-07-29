export interface DataDrainRunRecord {
  id: string
  drainId: string
  status: 'running' | 'success' | 'failed'
  trigger: 'cron' | 'manual'
  startedAt: Date
  finishedAt: Date | null
  rowsExported: number
  bytesWritten: number
  cursorBefore: string | null
  cursorAfter: string | null
  error: string | null
  locators: readonly string[] | null
}

export interface DataDrainRunReadRepository {
  /**
   * Returns null when the drain does not belong to the target organization.
   */
  listForOrganization(
    organizationId: string,
    drainId: string,
    limit: number
  ): Promise<readonly DataDrainRunRecord[] | null>
}

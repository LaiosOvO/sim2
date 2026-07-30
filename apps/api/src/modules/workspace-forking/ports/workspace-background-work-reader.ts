export type WorkspaceBackgroundWorkRecord = {
  readonly completedAt: Date | null
  readonly error: string | null
  readonly id: string
  readonly kind: 'deployment_side_effects' | 'fork_content_copy' | 'fork_sync' | 'fork_rollback'
  readonly message: string | null
  readonly metadata: unknown
  readonly startedAt: Date
  readonly status: 'pending' | 'processing' | 'completed' | 'completed_with_warnings' | 'failed'
  readonly workflowId: string | null
  readonly workspaceId: string
}

export type WorkspaceBackgroundWorkPage = {
  readonly nextCursor: string | null
  readonly records: readonly WorkspaceBackgroundWorkRecord[]
}

export interface WorkspaceBackgroundWorkReader {
  listInvolving(input: {
    readonly cursor?: string
    readonly limit: number
    readonly workspaceId: string
  }): Promise<WorkspaceBackgroundWorkPage>
}

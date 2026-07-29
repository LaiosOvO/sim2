export type WorkspaceExecutionMetricsLevel = 'error' | 'info' | 'running' | 'pending'

export interface WorkspaceExecutionMetricsWorkflow {
  id: string
  name: string
}

export interface WorkspaceExecutionMetricsSample {
  workflowId: string | null
  level: string
  startedAt: Date
  totalDurationMs: number | null
}

export interface WorkspaceExecutionMetricsWorkflowFilter {
  workspaceId: string
  workflowIds?: readonly string[]
  folderIds?: readonly string[]
}

export interface WorkspaceExecutionMetricsLogFilter {
  workflowIds: readonly string[]
  triggers?: readonly string[]
  levels?: readonly WorkspaceExecutionMetricsLevel[]
}

export interface WorkspaceExecutionMetricsBounds {
  minDate: Date | null
  maxDate: Date | null
}

export interface WorkspaceExecutionMetricsReadRepository {
  listWorkflows(
    filter: WorkspaceExecutionMetricsWorkflowFilter
  ): Promise<readonly WorkspaceExecutionMetricsWorkflow[]>
  readBounds(filter: WorkspaceExecutionMetricsLogFilter): Promise<WorkspaceExecutionMetricsBounds>
  listSamples(
    filter: WorkspaceExecutionMetricsLogFilter & { start: Date; end: Date }
  ): Promise<readonly WorkspaceExecutionMetricsSample[]>
}

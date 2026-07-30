import { useQuery } from '@tanstack/react-query'
import { requestJson } from '@/lib/api/client/request'
import {
  getJobStatusContract,
  getWorkflowExecutionStatusContract,
  type WorkflowExecutionStatusQueryV1,
} from '@/lib/api/contracts/execution-control'

export const EXECUTION_CONTROL_STATUS_STALE_TIME = 1_000
export const EXECUTION_CONTROL_POLL_INTERVAL = 2_000

export const executionControlKeys = {
  all: ['execution-control'] as const,
  jobs: () => [...executionControlKeys.all, 'job'] as const,
  job: (jobId?: string) => [...executionControlKeys.jobs(), jobId ?? ''] as const,
  workflows: () => [...executionControlKeys.all, 'workflow'] as const,
  execution: (workflowId?: string, executionId?: string) =>
    [...executionControlKeys.workflows(), workflowId ?? '', executionId ?? ''] as const,
}

export function useJobStatus(jobId?: string) {
  return useQuery({
    queryKey: executionControlKeys.job(jobId),
    queryFn: ({ signal }) =>
      requestJson(getJobStatusContract, {
        params: { jobId: jobId as string },
        signal,
      }),
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'completed' || status === 'failed' ? false : EXECUTION_CONTROL_POLL_INTERVAL
    },
    staleTime: EXECUTION_CONTROL_STATUS_STALE_TIME,
  })
}

export function useWorkflowExecutionStatus(
  workflowId?: string,
  executionId?: string,
  query: WorkflowExecutionStatusQueryV1 = {
    includeOutput: false,
    selectedOutputs: [],
  }
) {
  return useQuery({
    queryKey: [
      ...executionControlKeys.execution(workflowId, executionId),
      query.includeOutput,
      ...query.selectedOutputs,
    ],
    queryFn: ({ signal }) =>
      requestJson(getWorkflowExecutionStatusContract, {
        params: { id: workflowId as string, executionId: executionId as string },
        query: {
          includeOutput: String(query.includeOutput) as 'true' | 'false',
          selectedOutputs:
            query.selectedOutputs.length > 0 ? query.selectedOutputs.join(',') : undefined,
        },
        signal,
      }),
    enabled: Boolean(workflowId && executionId),
    refetchInterval: (statusQuery) => {
      const status = statusQuery.state.data?.status
      return status === 'completed' || status === 'failed' || status === 'cancelled'
        ? false
        : EXECUTION_CONTROL_POLL_INTERVAL
    },
    staleTime: EXECUTION_CONTROL_STATUS_STALE_TIME,
  })
}

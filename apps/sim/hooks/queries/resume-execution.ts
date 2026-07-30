import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isApiClientError } from '@/lib/api/client/errors'
import { requestJson } from '@/lib/api/client/request'
import {
  getPauseContextDetailContract,
  getPausedExecutionDetailContract,
  type PauseContextDetail,
  type PausedExecutionDetail,
} from '@/lib/api/contracts/execution-read'

export type {
  PauseContextDetail,
  PausedExecutionDetail,
  PausedExecutionSummary,
  PausePointWithQueue,
  ResumeQueueEntrySummary,
} from '@/lib/api/contracts/execution-read'

export const RESUME_EXECUTION_DETAIL_STALE_TIME = 30 * 1000

export const resumeKeys = {
  all: ['resume-execution'] as const,
  executions: () => [...resumeKeys.all, 'execution'] as const,
  execution: (workflowId?: string, executionId?: string) =>
    [...resumeKeys.executions(), workflowId ?? '', executionId ?? ''] as const,
  contexts: () => [...resumeKeys.all, 'context'] as const,
  context: (workflowId?: string, executionId?: string, contextId?: string) =>
    [...resumeKeys.contexts(), workflowId ?? '', executionId ?? '', contextId ?? ''] as const,
}

export interface ResumeContextResult {
  ok: boolean
  payload: {
    status?: string
    queuePosition?: number | null
    error?: string
    message?: string
    [key: string]: unknown
  }
}

interface ResumeContextVariables {
  workflowId: string
  executionId: string
  contextId: string
  input?: unknown
}

/**
 * Loads the paused execution detail (all pause points for an execution). The
 * The focused shared contract is the browser/server handoff for API-0282.
 */
export function useResumeExecutionDetail(
  workflowId: string,
  executionId: string,
  initialData?: PausedExecutionDetail
) {
  return useQuery({
    queryKey: resumeKeys.execution(workflowId, executionId),
    queryFn: async ({ signal }): Promise<PausedExecutionDetail> => {
      return requestJson(getPausedExecutionDetailContract, {
        params: { workflowId, executionId },
        signal,
      })
    },
    enabled: Boolean(workflowId && executionId),
    staleTime: RESUME_EXECUTION_DETAIL_STALE_TIME,
    initialData,
  })
}

/**
 * Loads the detail for a single pause context. Returns `null` when the context
 * no longer exists (404). `staleTime: 0` because pause state is live.
 */
export function usePauseContextDetail(workflowId: string, executionId: string, contextId?: string) {
  return useQuery({
    queryKey: resumeKeys.context(workflowId, executionId, contextId),
    queryFn: async ({ signal }): Promise<PauseContextDetail | null> => {
      try {
        const raw = await requestJson(getPauseContextDetailContract, {
          params: { workflowId, executionId, contextId: contextId as string },
          signal,
        })
        // double-cast-allowed: contract models the pause point as z.record; the resume UI uses the richer PauseContextDetail interface
        return raw as unknown as PauseContextDetail
      } catch (error) {
        if (isApiClientError(error) && error.status === 404) return null
        throw error
      }
    },
    enabled: Boolean(workflowId && executionId && contextId),
    staleTime: 0,
  })
}

/**
 * Submits a resume for a pause context and invalidates the execution + context
 * queries so the cache reconciles with the server. The POST stays a raw fetch:
 * the route reads the body with a tolerant JSON parse and the contract has no
 * body schema, so it cannot go through `requestJson`.
 */
export function useResumeContext() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      workflowId,
      executionId,
      contextId,
      input,
    }: ResumeContextVariables): Promise<ResumeContextResult> => {
      // boundary-raw-fetch: resume-context POST contract has no body schema (route uses tolerant raw JSON parse for resume input forwarded to PauseResumeManager)
      const response = await fetch(`/api/resume/${workflowId}/${executionId}/${contextId}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input ? { input } : {}),
      })
      const payload = await response.json().catch(() => ({}))
      return { ok: response.ok, payload }
    },
    onSettled: (_data, _error, variables) =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: resumeKeys.execution(variables.workflowId, variables.executionId),
        }),
        queryClient.invalidateQueries({
          queryKey: resumeKeys.context(
            variables.workflowId,
            variables.executionId,
            variables.contextId
          ),
        }),
      ]),
  })
}

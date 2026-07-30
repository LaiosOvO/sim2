import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { requestJson } from '@/lib/api/client/request'
import type { ApprovalDefinitionSpecV1, ApprovalV1 } from '@/lib/api/contracts/approvals'
import {
  createApprovalDefinitionContract,
  createApprovalDefinitionVersionContract,
  decideApprovalContract,
  listApprovalAuditLogsContract,
  listApprovalDefinitionsContract,
  listApprovalsContract,
  publishApprovalDefinitionVersionContract,
  retryApprovalResumeContract,
} from '@/lib/api/contracts/approvals'

export const approvalKeys = {
  all: ['approvals'] as const,
  lists: () => [...approvalKeys.all, 'list'] as const,
  list: (workspaceId: string, status?: string) =>
    [...approvalKeys.lists(), workspaceId, status ?? 'all'] as const,
  definitions: (workspaceId: string) => [...approvalKeys.all, 'definitions', workspaceId] as const,
  auditLogs: (workspaceId: string) => [...approvalKeys.all, 'audit-logs', workspaceId] as const,
}

export function useApprovals(
  workspaceId: string,
  status?: ApprovalV1['status'],
  view: 'pending_for_me' | 'requested_by_me' | 'all' = 'all'
) {
  return useQuery({
    queryKey: [...approvalKeys.list(workspaceId, status), view],
    queryFn: ({ signal }) =>
      requestJson(listApprovalsContract, {
        query: { workspaceId, status, view, limit: 50 },
        signal,
      }).then((response) => response.approvals),
    enabled: Boolean(workspaceId),
    staleTime: 10_000,
  })
}

export function useApprovalDefinitions(workspaceId: string) {
  return useQuery({
    queryKey: approvalKeys.definitions(workspaceId),
    queryFn: ({ signal }) =>
      requestJson(listApprovalDefinitionsContract, {
        query: { workspaceId },
        signal,
      }).then((response) => response.definitions),
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
  })
}

export function useApprovalsForExecution(workspaceId: string, executionId?: string | null) {
  return useQuery({
    queryKey: [...approvalKeys.all, 'execution', workspaceId, executionId ?? ''],
    queryFn: ({ signal }) =>
      requestJson(listApprovalsContract, {
        query: {
          workspaceId,
          executionId: executionId || undefined,
          view: 'all',
          limit: 20,
        },
        signal,
      }).then((response) => response.approvals),
    enabled: Boolean(workspaceId && executionId),
    staleTime: 5_000,
    refetchInterval: (query) =>
      query.state.data?.some((approval) => approval.status === 'pending') ? 5_000 : false,
  })
}

export function useApprovalAuditLogs(
  workspaceId: string,
  filters: {
    status?: ApprovalV1['status']
    workflowId?: string
    projectId?: string
    eventCategory?: 'card_sent' | 'approved' | 'rejected' | 'returned' | 'write'
    search?: string
  }
) {
  return useQuery({
    queryKey: [...approvalKeys.auditLogs(workspaceId), filters],
    queryFn: ({ signal }) =>
      requestJson(listApprovalAuditLogsContract, {
        query: { workspaceId, ...filters, limit: 100 },
        signal,
      }),
    enabled: Boolean(workspaceId),
    staleTime: 5_000,
  })
}

export function useCreateApprovalDefinition(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: {
      code: string
      name: string
      description?: string
      spec: ApprovalDefinitionSpecV1
    }) =>
      requestJson(createApprovalDefinitionContract, {
        body: { workspaceId, ...body },
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: approvalKeys.definitions(workspaceId) }),
  })
}

export function useCreateApprovalDefinitionVersion(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      definitionId,
      spec,
    }: {
      definitionId: string
      spec: ApprovalDefinitionSpecV1
    }) =>
      requestJson(createApprovalDefinitionVersionContract, {
        params: { definitionId },
        body: { spec },
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: approvalKeys.definitions(workspaceId) }),
  })
}

export function usePublishApprovalDefinitionVersion(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ definitionId, versionId }: { definitionId: string; versionId: string }) =>
      requestJson(publishApprovalDefinitionVersionContract, {
        params: { definitionId, versionId },
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: approvalKeys.definitions(workspaceId) }),
  })
}

export function useDecideApproval() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      approvalId,
      taskId,
      action,
      comment,
      targetUserId,
    }: {
      approvalId: string
      taskId: string
      action: 'approve' | 'reject' | 'return' | 'transfer' | 'add_sign' | 'comment'
      comment?: string
      targetUserId?: string
    }) =>
      requestJson(decideApprovalContract, {
        params: { approvalId },
        body: { taskId, action, comment, targetUserId },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: approvalKeys.all }),
  })
}

export function useRetryApprovalResume() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ approvalId, reason }: { approvalId: string; reason?: string }) =>
      requestJson(retryApprovalResumeContract, {
        params: { approvalId },
        body: { reason },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: approvalKeys.all }),
  })
}

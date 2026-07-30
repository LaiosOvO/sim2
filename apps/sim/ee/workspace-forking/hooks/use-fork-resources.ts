import { useQuery } from '@tanstack/react-query'
import { requestJson } from '@/lib/api/client/request'
import { getForkResourcesContract } from '@/lib/api/contracts/workspace-fork-resources'
import {
  forkKeys,
  WORKSPACE_FORK_RESOURCES_STALE_TIME,
} from '@/ee/workspace-forking/hooks/fork-query-keys'

export function useForkResources(workspaceId?: string, enabled = true) {
  return useQuery({
    queryKey: forkKeys.resources(workspaceId),
    queryFn: ({ signal }) =>
      requestJson(getForkResourcesContract, { params: { id: workspaceId as string }, signal }),
    enabled: Boolean(workspaceId) && enabled,
    staleTime: WORKSPACE_FORK_RESOURCES_STALE_TIME,
  })
}

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { requestJson } from '@/lib/api/client/request'
import {
  type ForkWorkspaceBody,
  forkWorkspaceContract,
} from '@/lib/api/contracts/workspace-fork-create'
import type { WorkspacesResponse } from '@/lib/api/contracts/workspaces'
import { backgroundWorkKeys } from '@/ee/workspace-forking/hooks/background-work'
import { forkKeys } from '@/ee/workspace-forking/hooks/fork-query-keys'
import { workspaceKeys } from '@/hooks/queries/workspace'

export function useForkWorkspace() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { workspaceId: string; body: ForkWorkspaceBody }) =>
      requestJson(forkWorkspaceContract, { params: { id: vars.workspaceId }, body: vars.body }),
    onSuccess: (data) => {
      const newWorkspace = data.workspace
      queryClient.setQueryData<WorkspacesResponse>(workspaceKeys.list('active'), (previous) => {
        if (!previous) {
          return { workspaces: [newWorkspace], lastActiveWorkspaceId: null, creationPolicy: null }
        }
        if (previous.workspaces.some((workspace) => workspace.id === newWorkspace.id)) {
          return previous
        }
        return { ...previous, workspaces: [newWorkspace, ...previous.workspaces] }
      })
      queryClient.invalidateQueries({ queryKey: workspaceKeys.lists() })
      queryClient.invalidateQueries({ queryKey: workspaceKeys.adminLists() })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: forkKeys.lineages() })
      queryClient.invalidateQueries({ queryKey: backgroundWorkKeys.lists() })
    },
  })
}

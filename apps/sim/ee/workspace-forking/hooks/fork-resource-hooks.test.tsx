/**
 * @vitest-environment jsdom
 */
import { act, type ReactNode } from 'react'
import { sleep } from '@sim/utils/helpers'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockRequestJson } = vi.hoisted(() => ({ mockRequestJson: vi.fn() }))

vi.mock('@/lib/api/client/request', () => ({
  requestJson: mockRequestJson,
}))

import { forkWorkspaceContract } from '@/lib/api/contracts/workspace-fork-create'
import { getForkResourcesContract } from '@/lib/api/contracts/workspace-fork-resources'
import type { WorkspacesResponse } from '@/lib/api/contracts/workspaces'
import { backgroundWorkKeys } from '@/ee/workspace-forking/hooks/background-work'
import { workspaceKeys } from '@/hooks/queries/workspace'
import { forkKeys, WORKSPACE_FORK_RESOURCES_STALE_TIME } from './fork-query-keys'
import { useForkResources } from './use-fork-resources'
import { useForkWorkspace } from './use-fork-workspace'

function renderHookWithClient<T>(useHook: () => T): {
  result: () => T
  queryClient: QueryClient
  unmount: () => void
} {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const container = document.createElement('div')
  const root: Root = createRoot(container)
  let latest: T

  function Probe() {
    latest = useHook()
    return null
  }
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  act(() => {
    root.render(
      <Wrapper>
        <Probe />
      </Wrapper>
    )
  })
  return {
    result: () => latest,
    queryClient,
    unmount: () => act(() => root.unmount()),
  }
}

async function flush(): Promise<void> {
  await act(async () => {
    for (let index = 0; index < 5; index++) {
      await Promise.resolve()
      await sleep(0)
    }
  })
}

const workspace = {
  id: 'workspace-fork',
  name: 'Fork',
  ownerId: 'user-1',
  organizationId: null,
  workspaceMode: 'personal' as const,
}

const emptyWorkspaceCache: WorkspacesResponse = {
  workspaces: [],
  lastActiveWorkspaceId: null,
  creationPolicy: null,
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('focused fork resource hooks', () => {
  it('uses the focused resource contract, forwards cancellation, and freezes query policy', async () => {
    mockRequestJson.mockResolvedValue({
      files: [],
      tables: [],
      knowledgeBases: [],
      customTools: [],
      skills: [],
      mcpServers: [],
      workflowMcpServers: [],
    })
    const hook = renderHookWithClient(() => useForkResources('workspace-1'))
    await flush()

    expect(mockRequestJson).toHaveBeenCalledOnce()
    expect(mockRequestJson).toHaveBeenCalledWith(getForkResourcesContract, {
      params: { id: 'workspace-1' },
      signal: expect.any(AbortSignal),
    })
    const state = hook.queryClient.getQueryState(forkKeys.resources('workspace-1'))
    expect(state?.dataUpdatedAt).toBeGreaterThan(0)
    expect(hook.queryClient.getQueryDefaults(forkKeys.resources('workspace-1')).staleTime).toBe(
      undefined
    )
    expect(WORKSPACE_FORK_RESOURCES_STALE_TIME).toBe(30_000)
    hook.unmount()
  })

  it('keeps a disabled or missing workspace query cold', async () => {
    const disabled = renderHookWithClient(() => useForkResources('workspace-1', false))
    const missing = renderHookWithClient(() => useForkResources(undefined))
    await flush()
    expect(mockRequestJson).not.toHaveBeenCalled()
    disabled.unmount()
    missing.unmount()
  })

  it('inserts once and invalidates list, admin, lineage, and activity caches on success', async () => {
    mockRequestJson.mockResolvedValue({ workspace, workflowsCopied: 0 })
    const hook = renderHookWithClient(useForkWorkspace)
    hook.queryClient.setQueryData(workspaceKeys.list('active'), emptyWorkspaceCache)
    const invalidate = vi.spyOn(hook.queryClient, 'invalidateQueries')

    await act(async () => {
      await hook.result().mutateAsync({ workspaceId: 'source-1', body: { name: 'Fork' } })
    })
    await flush()

    expect(mockRequestJson).toHaveBeenCalledWith(forkWorkspaceContract, {
      params: { id: 'source-1' },
      body: { name: 'Fork' },
    })
    expect(
      hook.queryClient.getQueryData<WorkspacesResponse>(workspaceKeys.list('active'))?.workspaces
    ).toEqual([workspace])
    expect(invalidate).toHaveBeenCalledWith({ queryKey: workspaceKeys.lists() })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: workspaceKeys.adminLists() })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: forkKeys.lineages() })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: backgroundWorkKeys.lists() })

    await act(async () => {
      await hook.result().mutateAsync({ workspaceId: 'source-1', body: { name: 'Fork' } })
    })
    expect(
      hook.queryClient.getQueryData<WorkspacesResponse>(workspaceKeys.list('active'))?.workspaces
    ).toHaveLength(1)
    hook.unmount()
  })

  it('settles rejected mutations by refreshing lineage and activity only', async () => {
    mockRequestJson.mockRejectedValue(new Error('fork failed'))
    const hook = renderHookWithClient(useForkWorkspace)
    const invalidate = vi.spyOn(hook.queryClient, 'invalidateQueries')

    await act(async () => {
      await expect(
        hook.result().mutateAsync({ workspaceId: 'source-1', body: {} })
      ).rejects.toThrow('fork failed')
    })
    await flush()

    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: workspaceKeys.lists() })
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: workspaceKeys.adminLists() })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: forkKeys.lineages() })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: backgroundWorkKeys.lists() })
    hook.unmount()
  })
})

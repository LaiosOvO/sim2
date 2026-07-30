/**
 * @vitest-environment jsdom
 */
import { act } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PausedExecutionDetail } from '@/lib/api/contracts/execution-read'

const {
  mockRefetchExecutionDetail,
  mockRefetchWorkflowExecutionStatus,
  mockSetQueryState,
  mockUseWorkflowExecutionStatus,
  workflowStatusState,
} = vi.hoisted(() => ({
  mockRefetchExecutionDetail: vi.fn(),
  mockRefetchWorkflowExecutionStatus: vi.fn(),
  mockSetQueryState: vi.fn(),
  mockUseWorkflowExecutionStatus: vi.fn(),
  workflowStatusState: {
    isFetching: false,
    status: 'running',
  },
}))

const EXECUTION_DETAIL: PausedExecutionDetail = {
  id: 'paused-1',
  workflowId: 'workflow-1',
  executionId: 'execution-1',
  status: 'paused',
  totalPauseCount: 0,
  resumedCount: 0,
  pausedAt: '2026-07-30T00:00:00.000Z',
  updatedAt: '2026-07-30T00:00:00.000Z',
  expiresAt: null,
  metadata: null,
  triggerIds: [],
  pausePoints: [],
  executionSnapshot: {
    snapshot: '{"workflow":{"blocks":[]}}',
    triggerIds: [],
  },
  queue: [],
}

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('nuqs', () => ({
  useQueryState: () => ['overview', mockSetQueryState],
}))

vi.mock('@/hooks/queries/execution-control', () => ({
  useWorkflowExecutionStatus: mockUseWorkflowExecutionStatus,
}))

vi.mock('@/hooks/queries/resume-execution', () => ({
  resumeKeys: {
    execution: (workflowId: string, executionId: string) => [
      'resume-execution',
      'execution',
      workflowId,
      executionId,
    ],
    context: (workflowId: string, executionId: string, contextId: string) => [
      'resume-execution',
      'context',
      workflowId,
      executionId,
      contextId,
    ],
  },
  usePauseContextDetail: () => ({ data: undefined, isLoading: false }),
  useResumeContext: () => ({ mutateAsync: vi.fn() }),
  useResumeExecutionDetail: () => ({
    data: EXECUTION_DETAIL,
    isFetching: false,
    refetch: mockRefetchExecutionDetail,
  }),
}))

import ResumeExecutionPage from '@/app/(interfaces)/resume/[workflowId]/[executionId]/resume-page-client'

let container: HTMLDivElement
let root: Root
let queryClient: QueryClient

function renderPage(): void {
  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <ResumeExecutionPage
          params={{ workflowId: 'workflow-1', executionId: 'execution-1' }}
          initialExecutionDetail={EXECUTION_DETAIL}
        />
      </QueryClientProvider>
    )
  })
}

describe('ResumeExecutionPage focused execution status consumer', () => {
  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    workflowStatusState.isFetching = false
    workflowStatusState.status = 'running'
    mockRefetchExecutionDetail.mockResolvedValue({ data: EXECUTION_DETAIL })
    mockRefetchWorkflowExecutionStatus.mockResolvedValue({
      data: { status: 'running' },
    })
    mockUseWorkflowExecutionStatus.mockImplementation(
      (workflowId: string, executionId: string) => ({
        data: { workflowId, executionId, status: workflowStatusState.status },
        isFetching: workflowStatusState.isFetching,
        refetch: mockRefetchWorkflowExecutionStatus,
      })
    )
  })

  afterEach(() => {
    act(() => root.unmount())
    queryClient.clear()
    container.remove()
    vi.clearAllMocks()
  })

  it('renders the focused live status and updates when its projection changes', () => {
    renderPage()

    expect(mockUseWorkflowExecutionStatus).toHaveBeenCalledWith('workflow-1', 'execution-1')
    expect(
      container.querySelector('[aria-label="Overall execution status"]')?.textContent
    ).toContain('Running')

    workflowStatusState.status = 'completed'
    renderPage()

    expect(
      container.querySelector('[aria-label="Overall execution status"]')?.textContent
    ).toContain('Completed')
  })

  it('refreshes both the paused detail and the focused status projection', async () => {
    renderPage()

    const refreshButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Refresh execution details"]'
    )
    expect(refreshButton).not.toBeNull()

    await act(async () => {
      refreshButton?.click()
      await Promise.resolve()
    })

    expect(mockRefetchExecutionDetail).toHaveBeenCalledTimes(1)
    expect(mockRefetchWorkflowExecutionStatus).toHaveBeenCalledTimes(1)
  })
})

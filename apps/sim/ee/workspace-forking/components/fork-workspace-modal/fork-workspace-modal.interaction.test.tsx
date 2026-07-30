/**
 * @vitest-environment jsdom
 */
import { act, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import type { GetForkResourcesResponseV1 } from '@sim/api-contracts/workspace-forking'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockMutate, mockPush, mockToastSuccess, mockUseForkResources, mockUseForkWorkspace } =
  vi.hoisted(() => ({
    mockMutate: vi.fn(),
    mockPush: vi.fn(),
    mockToastSuccess: vi.fn(),
    mockUseForkResources: vi.fn(),
    mockUseForkWorkspace: vi.fn(),
  }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('@/ee/workspace-forking/hooks/use-fork-resources', () => ({
  useForkResources: mockUseForkResources,
}))

vi.mock('@/ee/workspace-forking/hooks/use-fork-workspace', () => ({
  useForkWorkspace: mockUseForkWorkspace,
}))

vi.mock('@sim/emcn/workspace-fork', () => ({
  AlertTriangle: () => <span aria-hidden='true'>!</span>,
  ChipCopyInput: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} readOnly />,
  ChipInput: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  ChipModal: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div data-testid='fork-modal'>{children}</div> : null,
  ChipModalHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  ChipModalBody: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  ChipModalError: ({ children }: { children?: ReactNode }) =>
    children ? <div role='alert'>{children}</div> : null,
  ChipModalFooter: ({
    primaryAction,
  }: {
    primaryAction: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }
  }) => (
    <footer>
      <button type='button' disabled={primaryAction.disabled} onClick={primaryAction.onClick}>
        {primaryAction.label}
      </button>
    </footer>
  ),
  toast: { success: mockToastSuccess },
}))

vi.mock('@/ee/workspace-forking/components/fork-resource-picker/fork-resource-picker', () => ({
  FileKindRow: ({
    files,
    onToggleItem,
  }: {
    files: Array<{ id: string }>
    onToggleItem: (id: string, checked: boolean) => void
  }) => (
    <button type='button' onClick={() => onToggleItem(files[0]?.id ?? '', false)}>
      Deselect first file
    </button>
  ),
  ResourceKindRow: ({
    label,
    items,
    onToggleItem,
  }: {
    label: string
    items: Array<{ id: string }>
    onToggleItem: (id: string, checked: boolean) => void
  }) => (
    <button type='button' onClick={() => onToggleItem(items[0]?.id ?? '', false)}>
      Deselect first {label}
    </button>
  ),
}))

import { ForkWorkspaceModal } from './fork-workspace-modal'

const resources: GetForkResourcesResponseV1 = {
  files: [
    {
      id: 'file-1',
      label: 'Input.csv',
      folderId: null,
      folderName: null,
    },
  ],
  tables: [{ id: 'table-1', label: 'Customers' }],
  knowledgeBases: [],
  customTools: [],
  skills: [],
  mcpServers: [],
  workflowMcpServers: [],
  deployedWorkflowCount: 1,
}

let mountedRoot: Root | undefined
let mountedContainer: HTMLDivElement | undefined

async function flushEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

function click(label: string): void {
  const button = [...(mountedContainer?.querySelectorAll('button') ?? [])].find(
    (candidate) => candidate.textContent === label
  )
  if (!button) throw new Error(`Missing button: ${label}`)
  act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}

afterEach(() => {
  if (mountedRoot) act(() => mountedRoot?.unmount())
  mountedRoot = undefined
  mountedContainer = undefined
  vi.clearAllMocks()
})

describe('ForkWorkspaceModal interaction journey', () => {
  it('hydrates focused resources, applies a deselection, and submits the exact copy set', async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    mockUseForkResources.mockReturnValue({ data: resources })
    mockUseForkWorkspace.mockReturnValue({ isPending: false, mutate: mockMutate })
    const onOpenChange = vi.fn()
    mockMutate.mockImplementation(
      (
        _input: unknown,
        callbacks: { onSuccess: (result: { workspace: { id: string; name: string } }) => void }
      ) => callbacks.onSuccess({ workspace: { id: 'fork-1', name: 'Source (fork)' } })
    )

    mountedContainer = document.createElement('div')
    mountedRoot = createRoot(mountedContainer)
    act(() => {
      mountedRoot?.render(
        <ForkWorkspaceModal
          open
          onOpenChange={onOpenChange}
          sourceWorkspaceId='workspace-1'
          sourceWorkspaceName='Source'
          canFork
          onUpgrade={vi.fn()}
        />
      )
    })
    await flushEffects()

    const nameInput = mountedContainer.querySelector<HTMLInputElement>(
      'input[aria-label="Workspace name"]'
    )
    expect(nameInput?.value).toBe('Source (fork)')

    click('Deselect first Tables')
    click('Fork')

    expect(mockMutate).toHaveBeenCalledWith(
      {
        workspaceId: 'workspace-1',
        body: {
          name: 'Source (fork)',
          copy: {
            files: ['file-1'],
            tables: [],
            knowledgeBases: [],
            customTools: [],
            skills: [],
            mcpServers: [],
            workflowMcpServers: [],
          },
        },
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      })
    )
    expect(mockToastSuccess).toHaveBeenCalledOnce()
    const toastOptions = mockToastSuccess.mock.calls[0]?.[1] as
      | { action?: { label?: string; onClick?: () => void } }
      | undefined
    expect(toastOptions?.action?.label).toBe('Open fork')
    act(() => toastOptions?.action?.onClick?.())
    expect(mockPush).toHaveBeenCalledWith('/workspace/fork-1/w')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('keeps the Fork action disabled until the focused resource query resolves', async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    mockUseForkResources.mockReturnValue({ data: undefined })
    mockUseForkWorkspace.mockReturnValue({ isPending: false, mutate: mockMutate })
    mountedContainer = document.createElement('div')
    mountedRoot = createRoot(mountedContainer)
    act(() => {
      mountedRoot?.render(
        <ForkWorkspaceModal
          open
          onOpenChange={vi.fn()}
          sourceWorkspaceId='workspace-1'
          sourceWorkspaceName='Source'
          canFork
          onUpgrade={vi.fn()}
        />
      )
    })
    await flushEffects()

    const forkButton = [...mountedContainer.querySelectorAll('button')].find(
      (candidate) => candidate.textContent === 'Fork'
    )
    expect(forkButton?.disabled).toBe(true)
    expect(mockMutate).not.toHaveBeenCalled()
  })
})

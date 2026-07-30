/**
 * @vitest-environment jsdom
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockNavigation,
  mockOpenState,
  mockProviderActions,
  mockProviderResponse,
  mockUseProviderModels,
} = vi.hoisted(() => ({
  mockNavigation: {
    pathname: '/workspace/workspace-b/settings/general',
  },
  mockOpenState: {
    isOpen: false,
  },
  mockProviderActions: {
    setOpenRouterModelInfo: vi.fn(),
    setProviderLoading: vi.fn(),
    setProviderModels: vi.fn(),
  },
  mockProviderResponse: {
    data: undefined as
      | {
          models: string[]
          modelInfo?: Record<string, { id: string; supportsTools?: boolean }>
        }
      | undefined,
    error: null as Error | null,
    isFetching: false,
    isLoading: false,
  },
  mockUseProviderModels: vi.fn(),
}))

mockUseProviderModels.mockImplementation(() => mockProviderResponse)

vi.mock('next/navigation', () => ({
  useParams: () => ({ workspaceId: 'workspace-b' }),
  usePathname: () => mockNavigation.pathname,
}))

vi.mock('@/hooks/queries/providers', () => ({
  useProviderModels: mockUseProviderModels,
}))

vi.mock('@/stores/modals/search/open-state', () => ({
  useSearchModalOpenStore: (selector: (state: typeof mockOpenState) => boolean): boolean =>
    selector(mockOpenState),
}))

vi.mock('@/stores/providers', () => ({
  useProvidersStore: (
    selector: (state: typeof mockProviderActions) => unknown
  ): ReturnType<typeof selector> => selector(mockProviderActions),
}))

import { ProviderModelsLoader } from '@/app/workspace/[workspaceId]/providers/provider-models-loader'

let container: HTMLDivElement
let root: Root

describe('ProviderModelsLoader', () => {
  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mockNavigation.pathname = '/workspace/workspace-b/settings/general'
    mockOpenState.isOpen = false
    mockProviderResponse.data = undefined
    mockProviderResponse.error = null
    mockProviderResponse.isFetching = false
    mockProviderResponse.isLoading = false
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.clearAllMocks()
  })

  it('does not fetch model catalogs on unrelated workspace routes', () => {
    act(() => {
      root.render(<ProviderModelsLoader />)
    })

    expect(mockUseProviderModels).not.toHaveBeenCalled()
  })

  it('fetches only the static model catalog in the workflow editor', () => {
    mockNavigation.pathname = '/workspace/workspace-b/w/workflow-a'

    act(() => {
      root.render(<ProviderModelsLoader />)
    })

    expect(mockUseProviderModels).toHaveBeenCalledTimes(1)
    expect(mockUseProviderModels).toHaveBeenCalledWith('base', undefined)
  })

  it.each(['/workspace/workspace-b/integrations', '/workspace/workspace-b/settings/custom-blocks'])(
    'fetches all catalogs on %s',
    (pathname) => {
      mockNavigation.pathname = pathname

      act(() => {
        root.render(<ProviderModelsLoader />)
      })

      expect(mockUseProviderModels).toHaveBeenCalledTimes(9)
      expect(mockUseProviderModels).toHaveBeenCalledWith('ollama-cloud', 'workspace-b')
      expect(mockUseProviderModels).toHaveBeenCalledWith('together', 'workspace-b')
    }
  )

  it('fetches all catalogs when command search opens', () => {
    mockNavigation.pathname = '/workspace/workspace-b/home'
    mockOpenState.isOpen = true

    act(() => {
      root.render(<ProviderModelsLoader />)
    })

    expect(mockUseProviderModels).toHaveBeenCalledTimes(9)
  })

  it('synchronizes remote models through the browser-safe provider store interface', () => {
    mockNavigation.pathname = '/workspace/workspace-b/w/workflow-a'
    mockProviderResponse.data = {
      models: ['gpt-a'],
      modelInfo: {
        'gpt-a': {
          id: 'gpt-a',
          supportsTools: true,
        },
      },
    }

    act(() => {
      root.render(<ProviderModelsLoader />)
    })

    expect(mockProviderActions.setProviderModels).toHaveBeenCalledWith('base', ['gpt-a'])
    expect(mockProviderActions.setOpenRouterModelInfo).not.toHaveBeenCalled()
  })
})

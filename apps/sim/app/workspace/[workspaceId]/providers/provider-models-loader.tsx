'use client'

import { useEffect } from 'react'
import { createLogger } from '@sim/logger'
import { useParams, usePathname } from 'next/navigation'
import { useProviderModels } from '@/hooks/queries/providers'
import { useSearchModalOpenStore } from '@/stores/modals/search/open-state'
import { type ProviderName, useProvidersStore } from '@/stores/providers'

const logger = createLogger('ProviderModelsLoader')

function useSyncProvider(provider: ProviderName, workspaceId?: string) {
  const setProviderModels = useProvidersStore((state) => state.setProviderModels)
  const setProviderLoading = useProvidersStore((state) => state.setProviderLoading)
  const setOpenRouterModelInfo = useProvidersStore((state) => state.setOpenRouterModelInfo)
  const { data, isLoading, isFetching, error } = useProviderModels(provider, workspaceId)

  useEffect(() => {
    setProviderLoading(provider, isLoading || isFetching)
  }, [provider, isLoading, isFetching, setProviderLoading])

  useEffect(() => {
    if (!data) return

    if (provider === 'openrouter' && data.modelInfo) {
      setOpenRouterModelInfo(data.modelInfo)
    }
    setProviderModels(provider, data.models)
  }, [provider, data, setProviderModels, setOpenRouterModelInfo])

  useEffect(() => {
    if (error) {
      logger.error(`Failed to load ${provider} models`, error)
    }
  }, [provider, error])
}

function BaseProviderModelsSynchronizer() {
  useSyncProvider('base')
  return null
}

function DynamicProviderModelsSynchronizer({ workspaceId }: { workspaceId?: string }) {
  useSyncProvider('ollama')
  useSyncProvider('ollama-cloud', workspaceId)
  useSyncProvider('vllm')
  useSyncProvider('litellm')
  useSyncProvider('openrouter')
  useSyncProvider('fireworks', workspaceId)
  useSyncProvider('together', workspaceId)
  useSyncProvider('baseten', workspaceId)
  return null
}

export function ProviderModelsLoader() {
  const params = useParams()
  const pathname = usePathname()
  const workspaceId = params?.workspaceId as string | undefined
  const isSearchModalOpen = useSearchModalOpenStore((state) => state.isOpen)
  const workspaceRoot = workspaceId ? `/workspace/${workspaceId}` : ''
  const isWorkflowEditor = workspaceRoot.length > 0 && pathname?.startsWith(`${workspaceRoot}/w/`)
  const shouldLoadDynamicModels =
    isSearchModalOpen ||
    (workspaceRoot.length > 0 &&
      (pathname?.startsWith(`${workspaceRoot}/integrations`) ||
        pathname?.startsWith(`${workspaceRoot}/settings/custom-blocks`)))

  if (!isWorkflowEditor && !shouldLoadDynamicModels) return null

  return (
    <>
      <BaseProviderModelsSynchronizer />
      {shouldLoadDynamicModels ? (
        <DynamicProviderModelsSynchronizer workspaceId={workspaceId} />
      ) : null}
    </>
  )
}

import type {
  RuntimeCredentialResolver,
  RuntimeProviderLoader,
  RuntimeToolRegistry,
} from '@/runtime/registry'
import {
  createRuntimeToolRegistry,
  RUNTIME_TOOL_DECLARATIONS,
  RuntimeRegistryFailure,
} from '@/runtime/registry'
import type { RuntimeProviderId } from '@/runtime/registry/declarations'

const providerLoaders = {
  notion: async () => {
    const provider = await import('@/runtime/providers/notion/provider')
    return provider.createNotionRuntimeProvider()
  },
} satisfies Record<RuntimeProviderId, RuntimeProviderLoader>

const unavailableCredentialResolver: RuntimeCredentialResolver = {
  async resolve(request) {
    throw new RuntimeRegistryFailure(
      'RUNTIME_CREDENTIAL_NOT_FOUND',
      `No credential resolver is configured for ${request.providerId}`
    )
  },
}

export function createWorkerRuntimeRegistry(
  credentials: RuntimeCredentialResolver = unavailableCredentialResolver
): RuntimeToolRegistry {
  return createRuntimeToolRegistry({
    declarations: RUNTIME_TOOL_DECLARATIONS,
    providerLoaders,
    credentials,
  })
}

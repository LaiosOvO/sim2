export type ProviderModelDiscoveryProviderV1 =
  | 'base'
  | 'baseten'
  | 'fireworks'
  | 'litellm'
  | 'ollama-cloud'
  | 'ollama'
  | 'openrouter'
  | 'together'
  | 'vllm'

export type ProviderModelDiscoveryRouteIdV1 =
  | 'API-0270'
  | 'API-0271'
  | 'API-0272'
  | 'API-0273'
  | 'API-0274'
  | 'API-0275'
  | 'API-0276'
  | 'API-0278'
  | 'API-0279'

/**
 * Pure routing metadata for server facades. Keep this subpath schema-free so a
 * proxy that only needs path dispatch cannot pull Zod or response contracts
 * into every Next route bundle.
 */
export const providerModelDiscoveryRoutesV1 = [
  {
    inventoryId: 'API-0270',
    path: '/api/providers/base/models',
    provider: 'base',
    workspaceAware: false,
  },
  {
    inventoryId: 'API-0271',
    path: '/api/providers/baseten/models',
    provider: 'baseten',
    workspaceAware: true,
  },
  {
    inventoryId: 'API-0272',
    path: '/api/providers/fireworks/models',
    provider: 'fireworks',
    workspaceAware: true,
  },
  {
    inventoryId: 'API-0273',
    path: '/api/providers/litellm/models',
    provider: 'litellm',
    workspaceAware: false,
  },
  {
    inventoryId: 'API-0274',
    path: '/api/providers/ollama-cloud/models',
    provider: 'ollama-cloud',
    workspaceAware: true,
  },
  {
    inventoryId: 'API-0275',
    path: '/api/providers/ollama/models',
    provider: 'ollama',
    workspaceAware: false,
  },
  {
    inventoryId: 'API-0276',
    path: '/api/providers/openrouter/models',
    provider: 'openrouter',
    workspaceAware: false,
  },
  {
    inventoryId: 'API-0278',
    path: '/api/providers/together/models',
    provider: 'together',
    workspaceAware: true,
  },
  {
    inventoryId: 'API-0279',
    path: '/api/providers/vllm/models',
    provider: 'vllm',
    workspaceAware: false,
  },
] as const satisfies readonly {
  inventoryId: ProviderModelDiscoveryRouteIdV1
  path: string
  provider: ProviderModelDiscoveryProviderV1
  workspaceAware: boolean
}[]

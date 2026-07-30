import { z } from 'zod'

export {
  type ProviderModelDiscoveryProviderV1,
  type ProviderModelDiscoveryRouteIdV1,
  providerModelDiscoveryRoutesV1,
} from './provider-model-discovery-routes'

export const providerModelDiscoveryProviderV1Schema = z.enum([
  'base',
  'baseten',
  'fireworks',
  'litellm',
  'ollama-cloud',
  'ollama',
  'openrouter',
  'together',
  'vllm',
])

export const providerModelDiscoveryRouteIdV1Schema = z.enum([
  'API-0270',
  'API-0271',
  'API-0272',
  'API-0273',
  'API-0274',
  'API-0275',
  'API-0276',
  'API-0278',
  'API-0279',
])

export const providerModelDiscoveryQueryV1Schema = z.object({
  workspaceId: z.string().min(1).optional(),
})

export const openRouterModelInfoV1Schema = z.object({
  id: z.string(),
  contextLength: z.number().optional(),
  supportsStructuredOutputs: z.boolean().optional(),
  supportsTools: z.boolean().optional(),
  pricing: z
    .object({
      input: z.number(),
      output: z.number(),
    })
    .optional(),
})

export const providerModelsResponseV1Schema = z.object({
  models: z.array(z.string()),
  modelInfo: z.record(z.string(), openRouterModelInfoV1Schema).optional(),
})

export const getBaseProviderModelsContractV1 = {
  method: 'GET',
  path: '/api/providers/base/models',
  response: { mode: 'json', schema: providerModelsResponseV1Schema },
} as const

export const getBasetenProviderModelsContractV1 = {
  method: 'GET',
  path: '/api/providers/baseten/models',
  query: providerModelDiscoveryQueryV1Schema,
  response: { mode: 'json', schema: providerModelsResponseV1Schema },
} as const

export const getFireworksProviderModelsContractV1 = {
  method: 'GET',
  path: '/api/providers/fireworks/models',
  query: providerModelDiscoveryQueryV1Schema,
  response: { mode: 'json', schema: providerModelsResponseV1Schema },
} as const

export const getLitellmProviderModelsContractV1 = {
  method: 'GET',
  path: '/api/providers/litellm/models',
  response: { mode: 'json', schema: providerModelsResponseV1Schema },
} as const

export const getOllamaCloudProviderModelsContractV1 = {
  method: 'GET',
  path: '/api/providers/ollama-cloud/models',
  query: providerModelDiscoveryQueryV1Schema,
  response: { mode: 'json', schema: providerModelsResponseV1Schema },
} as const

export const getOllamaProviderModelsContractV1 = {
  method: 'GET',
  path: '/api/providers/ollama/models',
  response: { mode: 'json', schema: providerModelsResponseV1Schema },
} as const

export const getOpenRouterProviderModelsContractV1 = {
  method: 'GET',
  path: '/api/providers/openrouter/models',
  response: { mode: 'json', schema: providerModelsResponseV1Schema },
} as const

export const getTogetherProviderModelsContractV1 = {
  method: 'GET',
  path: '/api/providers/together/models',
  query: providerModelDiscoveryQueryV1Schema,
  response: { mode: 'json', schema: providerModelsResponseV1Schema },
} as const

export const getVllmProviderModelsContractV1 = {
  method: 'GET',
  path: '/api/providers/vllm/models',
  response: { mode: 'json', schema: providerModelsResponseV1Schema },
} as const

export type ProviderModelDiscoveryQueryV1 = z.input<typeof providerModelDiscoveryQueryV1Schema>
export type OpenRouterModelInfoV1 = z.infer<typeof openRouterModelInfoV1Schema>
export type ProviderModelsResponseV1 = z.infer<typeof providerModelsResponseV1Schema>

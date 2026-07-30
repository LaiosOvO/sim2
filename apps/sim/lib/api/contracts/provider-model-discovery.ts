import {
  getBaseProviderModelsContractV1,
  getBasetenProviderModelsContractV1,
  getFireworksProviderModelsContractV1,
  getLitellmProviderModelsContractV1,
  getOllamaCloudProviderModelsContractV1,
  getOllamaProviderModelsContractV1,
  getOpenRouterProviderModelsContractV1,
  getTogetherProviderModelsContractV1,
  getVllmProviderModelsContractV1,
  type ProviderModelDiscoveryProviderV1,
  type ProviderModelsResponseV1,
} from '@sim/api-contracts/provider-model-discovery'
import { defineRouteContract } from '@/lib/api/contracts/types'

export type ProviderModelsResponse = ProviderModelsResponseV1
export type { ProviderModelDiscoveryProviderV1 }

export const getBaseProviderModelsContract = defineRouteContract(getBaseProviderModelsContractV1)
export const getBasetenProviderModelsContract = defineRouteContract(
  getBasetenProviderModelsContractV1
)
export const getFireworksProviderModelsContract = defineRouteContract(
  getFireworksProviderModelsContractV1
)
export const getLitellmProviderModelsContract = defineRouteContract(
  getLitellmProviderModelsContractV1
)
export const getOllamaCloudProviderModelsContract = defineRouteContract(
  getOllamaCloudProviderModelsContractV1
)
export const getOllamaProviderModelsContract = defineRouteContract(
  getOllamaProviderModelsContractV1
)
export const getOpenRouterProviderModelsContract = defineRouteContract(
  getOpenRouterProviderModelsContractV1
)
export const getTogetherProviderModelsContract = defineRouteContract(
  getTogetherProviderModelsContractV1
)
export const getVllmProviderModelsContract = defineRouteContract(getVllmProviderModelsContractV1)

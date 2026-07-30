import type { ProviderModelDiscoveryProviderV1 } from '@sim/api-contracts/provider-model-discovery'

export type RemoteProviderModelSource = Exclude<ProviderModelDiscoveryProviderV1, 'base'>

export interface ProviderModelSource {
  read(input: {
    readonly apiKey?: string
    readonly provider: RemoteProviderModelSource
    readonly signal?: AbortSignal
  }): Promise<unknown | null>
}

import { baseProviderModelCatalog } from '@/infrastructure/generated/base-provider-model-catalog.generated'
import type { BaseProviderModelCatalog } from '@/modules/provider-model-discovery/ports/base-provider-model-catalog'

export function createGeneratedBaseProviderModelCatalog(): BaseProviderModelCatalog {
  return {
    list() {
      return baseProviderModelCatalog
    },
  }
}

import type { W2TenantReadRouteId } from '@sim/api-contracts/w2-tenant-read'
import type {
  NativeTenantReadHandler,
  TenantReadBackend,
} from '@/modules/tenant-read/application/ports'

export interface RoutedTenantReadBackendOptions {
  fallback: TenantReadBackend
  nativeHandlers: Partial<Record<W2TenantReadRouteId, NativeTenantReadHandler>>
}

/**
 * Selects a native read handler by stable inventory ID and delegates every
 * unmigrated route to the explicit compatibility backend.
 */
export function createRoutedTenantReadBackend(
  options: RoutedTenantReadBackendOptions
): TenantReadBackend {
  return {
    async forward(input) {
      const handler = options.nativeHandlers[input.route.inventoryId]
      if (!handler) return options.fallback.forward(input)
      return {
        backend: 'native',
        response: await handler(input),
      }
    },
  }
}

export function createUnavailableTenantReadBackend(): TenantReadBackend {
  return {
    async forward() {
      throw new Error('Legacy tenant-read origin is not configured')
    },
  }
}

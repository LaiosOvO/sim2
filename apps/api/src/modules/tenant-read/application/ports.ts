import type { W2TenantReadRouteContract } from '@sim/api-contracts/w2-tenant-read'

export interface TenantReadCompatibilityBackend {
  forward(input: {
    request: Request
    requestId: string
    route: W2TenantReadRouteContract
  }): Promise<Response>
}

import type { AuthenticatedRequestContext } from '@sim/api-contracts/auth'
import type {
  W2TenantReadBackend,
  W2TenantReadRouteContract,
} from '@sim/api-contracts/w2-tenant-read'

export interface TenantReadBackendInput {
  request: Request
  requestId: string
  route: W2TenantReadRouteContract
  authenticationContext?: AuthenticatedRequestContext
}

export interface TenantReadBackendResult {
  response: Response
  backend: W2TenantReadBackend
}

export interface TenantReadBackend {
  forward(input: TenantReadBackendInput): Promise<TenantReadBackendResult>
}

export type NativeTenantReadHandler = (input: TenantReadBackendInput) => Promise<Response>

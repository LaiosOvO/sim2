import { proxyW2TenantReadRequest } from '@/lib/api-proxy/w2-tenant-read'

export const dynamic = 'force-dynamic'

export function GET(request: Request): Promise<Response> {
  return proxyW2TenantReadRequest(request, 'API-0235')
}

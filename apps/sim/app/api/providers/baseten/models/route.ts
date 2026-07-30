import { proxyProviderModelDiscoveryRequest } from '@/lib/api-proxy/provider-model-discovery'

export const dynamic = 'force-dynamic'

export function GET(request: Request): Promise<Response> {
  return proxyProviderModelDiscoveryRequest(request, 'API-0271')
}

import { proxyW5CustomBlockRequest } from '@/lib/api-proxy/w5-custom-blocks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(request: Request) {
  return proxyW5CustomBlockRequest(request, 'API-0094')
}

export async function DELETE(request: Request) {
  return proxyW5CustomBlockRequest(request, 'API-0094')
}

export async function OPTIONS(request: Request) {
  return proxyW5CustomBlockRequest(request, 'API-0094')
}

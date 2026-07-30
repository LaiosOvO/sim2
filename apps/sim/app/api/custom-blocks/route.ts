import { proxyW5CustomBlockRequest } from '@/lib/api-proxy/w5-custom-blocks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return proxyW5CustomBlockRequest(request, 'API-0096')
}

export async function POST(request: Request) {
  return proxyW5CustomBlockRequest(request, 'API-0096')
}

export async function HEAD(request: Request) {
  return proxyW5CustomBlockRequest(request, 'API-0096')
}

export async function OPTIONS(request: Request) {
  return proxyW5CustomBlockRequest(request, 'API-0096')
}

import { proxyW6ExecutionReadRequest } from '@/lib/api-proxy/w6-execution-read'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return proxyW6ExecutionReadRequest(request, 'API-0997')
}

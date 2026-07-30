import { proxyW6ExecutionControlRequest } from '@/lib/api-proxy/w6-execution-control'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(request: Request) {
  return proxyW6ExecutionControlRequest(request, 'API-0283')
}

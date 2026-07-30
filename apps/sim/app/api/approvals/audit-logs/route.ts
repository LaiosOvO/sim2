import { proxyW8ApprovalRequest } from '@/lib/api-proxy/w8-approvals'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET(request: Request) {
  return proxyW8ApprovalRequest(request, 'API-0004')
}

import { proxyW8ApprovalRequest } from '@/lib/api-proxy/w8-approvals'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function POST(request: Request) {
  return proxyW8ApprovalRequest(request, 'API-0010')
}

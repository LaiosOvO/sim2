import { proxyW1Request } from '@/lib/api-proxy/w1'

export function GET(request: Request): Promise<Response> {
  return proxyW1Request(request, 'environment')
}

export function POST(request: Request): Promise<Response> {
  return proxyW1Request(request, 'environment')
}

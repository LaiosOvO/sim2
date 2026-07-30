import { randomUUID } from 'node:crypto'
import type { ApprovalRouteV1 } from '@sim/api-contracts/approvals'

export type W8ApprovalRouteId = ApprovalRouteV1['inventoryId']

const patterns: Readonly<Record<W8ApprovalRouteId, RegExp>> = {
  'API-0002': /^\/api\/approvals\/[^/]+\/decisions$/,
  'API-0003': /^\/api\/approvals\/[^/]+\/resume$/,
  'API-0004': /^\/api\/approvals\/audit-logs$/,
  'API-0005': /^\/api\/approvals\/definitions\/[^/]+\/versions\/[^/]+\/publish$/,
  'API-0006': /^\/api\/approvals\/definitions\/[^/]+\/versions$/,
  'API-0007': /^\/api\/approvals\/definitions$/,
  'API-0009': /^\/api\/approvals$/,
  'API-0010': /^\/api\/approvals\/start$/,
}

export interface W8ApprovalProxyOptions {
  fetcher?: typeof fetch
  apiBaseUrl?: string
  timeoutMs?: number
}

export async function proxyW8ApprovalRequest(
  request: Request,
  routeId: W8ApprovalRouteId,
  options: W8ApprovalProxyOptions = {}
): Promise<Response> {
  const source = new URL(request.url)
  if (!patterns[routeId].test(source.pathname)) {
    return Response.json({ error: 'Route mismatch' }, { status: 500 })
  }
  const requestId =
    request.headers.get('x-request-id') ?? request.headers.get('x-correlation-id') ?? randomUUID()
  const baseUrl = options.apiBaseUrl ?? process.env.SIM_API_BASE_URL ?? 'http://127.0.0.1:3002'
  const target = new URL(`${source.pathname}${source.search}`, baseUrl)
  if (target.origin === source.origin) {
    return Response.json({ error: 'Recursive API proxy target', requestId }, { status: 503 })
  }
  const headers = new Headers(request.headers)
  for (const name of ['connection', 'content-length', 'host', 'transfer-encoding']) {
    headers.delete(name)
  }
  headers.set('x-request-id', requestId)
  const hasBody = request.method === 'POST'
  try {
    const response = await (options.fetcher ?? fetch)(target, {
      method: request.method,
      headers,
      ...(hasBody ? { body: await request.arrayBuffer() } : {}),
      redirect: 'manual',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(options.timeoutMs ?? 30_000)]),
    })
    const responseHeaders = new Headers(response.headers)
    responseHeaders.set('x-request-id', requestId)
    responseHeaders.set('x-sim-api-route', `${routeId}:api`)
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    })
  } catch {
    return Response.json(
      { error: 'Approval API unavailable', requestId },
      {
        status: 503,
        headers: {
          'retry-after': '1',
          'x-request-id': requestId,
          'x-sim-api-route': `${routeId}:unavailable`,
        },
      }
    )
  }
}

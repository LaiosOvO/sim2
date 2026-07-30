import { randomUUID } from 'node:crypto'

export type W6ExecutionControlRouteId = 'API-0138' | 'API-0283' | 'API-0993'

const patterns: Readonly<Record<W6ExecutionControlRouteId, RegExp>> = {
  'API-0138': /^\/api\/jobs\/[^/]+$/,
  'API-0283': /^\/api\/resume\/poll$/,
  'API-0993': /^\/api\/workflows\/[^/]+\/executions\/[^/]+$/,
}

export interface W6ExecutionControlProxyOptions {
  fetcher?: typeof fetch
  apiBaseUrl?: string
  timeoutMs?: number
}

export async function proxyW6ExecutionControlRequest(
  request: Request,
  routeId: W6ExecutionControlRouteId,
  options: W6ExecutionControlProxyOptions = {}
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
  try {
    const response = await (options.fetcher ?? fetch)(target, {
      method: request.method,
      headers,
      redirect: 'manual',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(options.timeoutMs ?? 120_000)]),
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
      { error: 'API route unavailable', requestId },
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

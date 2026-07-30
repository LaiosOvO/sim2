import { randomUUID } from 'node:crypto'
import {
  type ProviderModelDiscoveryRouteIdV1,
  providerModelDiscoveryRoutesV1,
} from '@sim/api-contracts/provider-model-discovery-routes'

export interface ProviderModelDiscoveryProxyOverrides {
  readonly apiBaseUrl?: string
  readonly fetcher?: typeof fetch
  readonly timeoutMs?: number
}

const pathByRouteId = new Map(
  providerModelDiscoveryRoutesV1.map((route) => [route.inventoryId, route.path])
)

function requestId(request: Request): string {
  return (
    request.headers.get('x-request-id') ?? request.headers.get('x-correlation-id') ?? randomUUID()
  )
}

function forwardHeaders(request: Request, id: string): Headers {
  const headers = new Headers(request.headers)
  for (const name of ['connection', 'content-length', 'host', 'transfer-encoding']) {
    headers.delete(name)
  }
  headers.set('x-request-id', id)
  return headers
}

export async function proxyProviderModelDiscoveryRequest(
  request: Request,
  routeId: ProviderModelDiscoveryRouteIdV1,
  overrides: ProviderModelDiscoveryProxyOverrides = {}
): Promise<Response> {
  const source = new URL(request.url)
  if (request.method !== 'GET' || source.pathname !== pathByRouteId.get(routeId)) {
    return Response.json({ error: 'Route mismatch' }, { status: 500 })
  }

  const id = requestId(request)
  const apiBaseUrl = overrides.apiBaseUrl ?? process.env.SIM_API_BASE_URL ?? 'http://127.0.0.1:3002'
  const target = new URL(`${source.pathname}${source.search}`, apiBaseUrl)
  if (target.origin === source.origin) {
    return Response.json(
      { error: 'API route unavailable', requestId: id },
      { status: 503, headers: { 'retry-after': '1', 'x-request-id': id } }
    )
  }

  const configuredTimeout =
    overrides.timeoutMs ?? Number.parseInt(process.env.SIM_API_PROXY_TIMEOUT_MS ?? '10000', 10)
  const timeoutMs = Number.isFinite(configuredTimeout)
    ? Math.min(Math.max(configuredTimeout, 100), 120_000)
    : 10_000
  try {
    const response = await (overrides.fetcher ?? fetch)(target, {
      headers: forwardHeaders(request, id),
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)]),
    })
    const headers = new Headers(response.headers)
    headers.set('x-request-id', id)
    headers.set('x-sim-api-route', `${routeId}:api`)
    return new Response(response.body, {
      headers,
      status: response.status,
      statusText: response.statusText,
    })
  } catch {
    return Response.json(
      { error: 'API route unavailable', requestId: id },
      {
        status: 503,
        headers: {
          'retry-after': '1',
          'x-request-id': id,
          'x-sim-api-route': `${routeId}:unavailable`,
        },
      }
    )
  }
}

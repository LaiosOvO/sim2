import { randomUUID } from 'node:crypto'

export type W1RouteId = 'environment' | 'health' | 'status'
export type W1RouteMode = 'api' | 'legacy' | 'off'

export interface W1ProxyOverrides {
  fetcher?: typeof fetch
  apiBaseUrl?: string
  legacyBaseUrl?: string
  mode?: W1RouteMode
  fallbackToLegacy?: boolean
  timeoutMs?: number
}

const routePaths: Record<W1RouteId, string> = {
  environment: '/api/environment',
  health: '/api/health',
  status: '/api/status',
}

const modeEnvironmentKeys: Record<W1RouteId, string> = {
  environment: 'SIM_API_W1_ENVIRONMENT_MODE',
  health: 'SIM_API_W1_HEALTH_MODE',
  status: 'SIM_API_W1_STATUS_MODE',
}

function modeFromEnvironment(routeId: W1RouteId): W1RouteMode {
  const value = process.env[modeEnvironmentKeys[routeId]]?.trim().toLowerCase()
  return value === 'legacy' || value === 'off' ? value : 'api'
}

function timeoutFromEnvironment(): number {
  const parsed = Number.parseInt(process.env.SIM_API_PROXY_TIMEOUT_MS ?? '10000', 10)
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 100), 120_000) : 10_000
}

function forwardHeaders(request: Request, requestId: string): Headers {
  const headers = new Headers(request.headers)
  for (const name of ['connection', 'content-length', 'host', 'transfer-encoding']) {
    headers.delete(name)
  }
  const source = new URL(request.url)
  headers.set('x-forwarded-host', source.host)
  headers.set('x-forwarded-proto', source.protocol.slice(0, -1))
  headers.set('x-request-id', requestId)
  return headers
}

async function forward(
  request: Request,
  routeId: W1RouteId,
  targetBaseUrl: string,
  fetcher: typeof fetch,
  requestId: string,
  timeoutMs: number,
  targetName: 'api' | 'legacy'
): Promise<Response> {
  const source = new URL(request.url)
  const target = new URL(`${source.pathname}${source.search}`, targetBaseUrl)
  if (target.origin === source.origin) {
    throw new Error(`Refusing recursive ${targetName} proxy target`)
  }
  const body =
    request.method === 'GET' || request.method === 'HEAD'
      ? undefined
      : new Uint8Array(await request.arrayBuffer())
  const response = await fetcher(target, {
    method: request.method,
    headers: forwardHeaders(request, requestId),
    body,
    redirect: 'manual',
    signal: AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)]),
  })
  const headers = new Headers(response.headers)
  headers.set('x-request-id', requestId)
  headers.set('x-sim-api-route', `${routeId}:${targetName}`)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export async function proxyW1Request(
  request: Request,
  routeId: W1RouteId,
  overrides: W1ProxyOverrides = {}
): Promise<Response> {
  const expectedPath = routePaths[routeId]
  if (new URL(request.url).pathname !== expectedPath) {
    return Response.json({ error: 'Route mismatch' }, { status: 500 })
  }

  const mode = overrides.mode ?? modeFromEnvironment(routeId)
  const requestId =
    request.headers.get('x-request-id') ?? request.headers.get('x-correlation-id') ?? randomUUID()
  if (mode === 'off') {
    return Response.json(
      { error: 'API route disabled', requestId },
      { status: 503, headers: { 'x-request-id': requestId, 'x-sim-api-route': `${routeId}:off` } }
    )
  }

  const fetcher = overrides.fetcher ?? fetch
  const apiBaseUrl = overrides.apiBaseUrl ?? process.env.SIM_API_BASE_URL ?? 'http://127.0.0.1:3012'
  const legacyBaseUrl = overrides.legacyBaseUrl ?? process.env.SIM_LEGACY_API_BASE_URL
  const timeoutMs = overrides.timeoutMs ?? timeoutFromEnvironment()
  const fallbackToLegacy =
    overrides.fallbackToLegacy ??
    ['1', 'true'].includes(process.env.SIM_API_PROXY_FALLBACK_LEGACY?.toLowerCase() ?? '')
  const primaryRequest = request.clone()
  const fallbackRequest = request.clone()

  try {
    if (mode === 'legacy') {
      if (!legacyBaseUrl) throw new Error('SIM_LEGACY_API_BASE_URL is not configured')
      return await forward(
        primaryRequest,
        routeId,
        legacyBaseUrl,
        fetcher,
        requestId,
        timeoutMs,
        'legacy'
      )
    }
    return await forward(primaryRequest, routeId, apiBaseUrl, fetcher, requestId, timeoutMs, 'api')
  } catch {
    if (mode === 'api' && fallbackToLegacy && legacyBaseUrl) {
      try {
        return await forward(
          fallbackRequest,
          routeId,
          legacyBaseUrl,
          fetcher,
          requestId,
          timeoutMs,
          'legacy'
        )
      } catch {
        // Fall through to the stable proxy error below.
      }
    }
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

import { randomUUID } from 'node:crypto'
import type { CustomBlockRouteV1 } from '@sim/api-contracts/custom-blocks'

export type W5CustomBlockRouteId = CustomBlockRouteV1['inventoryId']
export type W5CustomBlockRouteMode = 'api' | 'legacy' | 'off'

export interface W5CustomBlockProxyOverrides {
  fetcher?: typeof fetch
  apiBaseUrl?: string
  legacyBaseUrl?: string
  mode?: W5CustomBlockRouteMode
  fallbackToLegacy?: boolean
  timeoutMs?: number
}

function modeFromEnvironment(): W5CustomBlockRouteMode {
  const value = process.env.SIM_API_W5_CUSTOM_BLOCK_MODE?.trim().toLowerCase()
  return value === 'legacy' || value === 'off' ? value : 'api'
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
  routeId: W5CustomBlockRouteId,
  targetBaseUrl: string,
  fetcher: typeof fetch,
  requestId: string,
  timeoutMs: number,
  targetName: 'api' | 'legacy'
): Promise<Response> {
  const source = new URL(request.url)
  const target = new URL(`${source.pathname}${source.search}`, targetBaseUrl)
  if (target.origin === source.origin) {
    throw new Error(`Refusing recursive ${targetName} W5 custom-block proxy target`)
  }
  const hasBody = request.method === 'POST' || request.method === 'PATCH'
  const response = await fetcher(target, {
    method: request.method,
    headers: forwardHeaders(request, requestId),
    ...(hasBody ? { body: await request.arrayBuffer() } : {}),
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

export async function proxyW5CustomBlockRequest(
  request: Request,
  routeId: W5CustomBlockRouteId,
  overrides: W5CustomBlockProxyOverrides = {}
): Promise<Response> {
  const mode = overrides.mode ?? modeFromEnvironment()
  const requestId =
    request.headers.get('x-request-id') ?? request.headers.get('x-correlation-id') ?? randomUUID()
  if (mode === 'off') {
    return Response.json(
      { error: 'API route disabled', requestId },
      {
        status: 503,
        headers: {
          'x-request-id': requestId,
          'x-sim-api-route': `${routeId}:off`,
        },
      }
    )
  }

  const fetcher = overrides.fetcher ?? fetch
  const apiBaseUrl = overrides.apiBaseUrl ?? process.env.SIM_API_BASE_URL ?? 'http://127.0.0.1:3002'
  const legacyBaseUrl = overrides.legacyBaseUrl ?? process.env.SIM_LEGACY_API_BASE_URL
  const timeoutMs =
    overrides.timeoutMs ??
    Math.min(
      Math.max(Number.parseInt(process.env.SIM_API_PROXY_TIMEOUT_MS ?? '10000', 10), 100),
      120_000
    )
  const fallbackToLegacy =
    overrides.fallbackToLegacy ??
    ['1', 'true'].includes(process.env.SIM_API_PROXY_FALLBACK_LEGACY?.toLowerCase() ?? '')

  try {
    if (mode === 'legacy') {
      if (!legacyBaseUrl) throw new Error('SIM_LEGACY_API_BASE_URL is not configured')
      return await forward(request, routeId, legacyBaseUrl, fetcher, requestId, timeoutMs, 'legacy')
    }
    return await forward(request, routeId, apiBaseUrl, fetcher, requestId, timeoutMs, 'api')
  } catch {
    if (mode === 'api' && fallbackToLegacy && legacyBaseUrl) {
      try {
        return await forward(
          request,
          routeId,
          legacyBaseUrl,
          fetcher,
          requestId,
          timeoutMs,
          'legacy'
        )
      } catch {
        // The stable unavailable response below is shared by both attempts.
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

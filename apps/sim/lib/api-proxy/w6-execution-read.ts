import { randomUUID } from 'node:crypto'
import type { ExecutionReadRouteV1 } from '@sim/api-contracts/execution-read'

export type W6ExecutionReadRouteId = ExecutionReadRouteV1['inventoryId']
export type W6ExecutionReadRouteMode = 'api' | 'legacy' | 'off'

export interface W6ExecutionReadProxyOverrides {
  fetcher?: typeof fetch
  apiBaseUrl?: string
  legacyBaseUrl?: string
  mode?: W6ExecutionReadRouteMode
  fallbackToLegacy?: boolean
  timeoutMs?: number
}

const routePatterns: Readonly<Record<W6ExecutionReadRouteId, RegExp>> = {
  'API-0282': /^\/api\/resume\/[^/]+\/[^/]+$/,
  'API-0996': /^\/api\/workflows\/[^/]+\/paused\/[^/]+$/,
  'API-0997': /^\/api\/workflows\/[^/]+\/paused$/,
}

function modeFromEnvironment(): W6ExecutionReadRouteMode {
  const value = process.env.SIM_API_W6_EXECUTION_READ_MODE?.trim().toLowerCase()
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
  routeId: W6ExecutionReadRouteId,
  targetBaseUrl: string,
  fetcher: typeof fetch,
  requestId: string,
  timeoutMs: number,
  targetName: 'api' | 'legacy'
): Promise<Response> {
  const source = new URL(request.url)
  const target = new URL(`${source.pathname}${source.search}`, targetBaseUrl)
  if (target.origin === source.origin) {
    throw new Error(`Refusing recursive ${targetName} W6 execution-read proxy target`)
  }
  const response = await fetcher(target, {
    method: 'GET',
    headers: forwardHeaders(request, requestId),
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

export async function proxyW6ExecutionReadRequest(
  request: Request,
  routeId: W6ExecutionReadRouteId,
  overrides: W6ExecutionReadProxyOverrides = {}
): Promise<Response> {
  if (request.method !== 'GET' || !routePatterns[routeId].test(new URL(request.url).pathname)) {
    return Response.json({ error: 'Route mismatch' }, { status: 500 })
  }

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
  const timeoutMs = overrides.timeoutMs ?? timeoutFromEnvironment()
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

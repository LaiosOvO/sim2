import { randomUUID } from 'node:crypto'
import type { W2TenantReadRouteId } from '@sim/api-contracts/w2-tenant-read'

export type W2TenantReadRouteMode = 'api' | 'legacy' | 'off'

export interface W2TenantReadProxyOverrides {
  fetcher?: typeof fetch
  apiBaseUrl?: string
  legacyBaseUrl?: string
  mode?: W2TenantReadRouteMode
  fallbackToLegacy?: boolean
  timeoutMs?: number
}

const routePatterns: Readonly<Record<W2TenantReadRouteId, RegExp>> = {
  'API-0137': /^\/api\/invitations$/,
  'API-0209': /^\/api\/organizations\/[^/]+\/data-drains\/[^/]+\/runs$/,
  'API-0235': /^\/api\/organizations\/[^/]+\/roster$/,
  'API-0241': /^\/api\/organizations\/[^/]+\/workspaces$/,
  'API-0243': /^\/api\/permission-groups\/user$/,
  'API-0294': /^\/api\/stars$/,
  'API-0885': /^\/api\/users\/me\/usage-limits$/,
  'API-0887': /^\/api\/users\/me\/usage-logs$/,
  'API-1006': /^\/api\/workspace-events\/poll$/,
  'API-1009': /^\/api\/workspaces\/[^/]+\/background-work$/,
  'API-1011': /^\/api\/workspaces\/[^/]+\/credit-availability$/,
  'API-1031': /^\/api\/workspaces\/[^/]+\/fork\/availability$/,
  'API-1032': /^\/api\/workspaces\/[^/]+\/fork\/diff$/,
  'API-1034': /^\/api\/workspaces\/[^/]+\/fork\/lineage$/,
  'API-1037': /^\/api\/workspaces\/[^/]+\/fork\/resources$/,
  'API-1041': /^\/api\/workspaces\/[^/]+\/host-context$/,
  'API-1056': /^\/api\/workspaces\/[^/]+\/inbox\/tasks$/,
  'API-1057': /^\/api\/workspaces\/[^/]+\/members$/,
  'API-1058': /^\/api\/workspaces\/[^/]+\/metrics\/executions$/,
  'API-1060': /^\/api\/workspaces\/[^/]+\/personal-profile$/,
  'API-1122': /^\/api\/workspaces\/[^/]+\/usage-gate$/,
  'API-1124': /^\/api\/workspaces\/invitations$/,
}

function modeFromEnvironment(): W2TenantReadRouteMode {
  const value = process.env.SIM_API_W2_TENANT_READ_MODE?.trim().toLowerCase()
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
  routeId: W2TenantReadRouteId,
  targetBaseUrl: string,
  fetcher: typeof fetch,
  requestId: string,
  timeoutMs: number,
  targetName: 'api' | 'legacy'
): Promise<Response> {
  const source = new URL(request.url)
  const target = new URL(`${source.pathname}${source.search}`, targetBaseUrl)
  if (target.origin === source.origin) {
    throw new Error(`Refusing recursive ${targetName} W2 tenant-read proxy target`)
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

export async function proxyW2TenantReadRequest(
  request: Request,
  routeId: W2TenantReadRouteId,
  overrides: W2TenantReadProxyOverrides = {}
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
  const apiBaseUrl = overrides.apiBaseUrl ?? process.env.SIM_API_BASE_URL ?? 'http://127.0.0.1:3012'
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

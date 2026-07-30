import type {
  ProviderToolRouteAdapterRegistry,
  ToolAdapterInvocation,
  ToolAdapterResult,
  ToolRouteAccess,
  ToolRouteRollout,
  W4ToolRouteDescriptor,
} from '@/modules/tool-adapters/contracts'
import { createToolRouteTable } from '@/modules/tool-adapters/route-table'

const requestHeaderAllowlist = new Set([
  'accept',
  'content-type',
  'idempotency-key',
  'x-request-id',
])
const responseHeaderAllowlist = new Set([
  'content-disposition',
  'content-type',
  'retry-after',
  'x-request-id',
])

export type ToolRouteCompatibilityHandlerOptions = {
  readonly access: ToolRouteAccess
  readonly fallbackAdapters: ProviderToolRouteAdapterRegistry
  readonly manifest: readonly W4ToolRouteDescriptor[]
  readonly maxRequestBodyBytes?: number
  readonly nativeAdapters: ProviderToolRouteAdapterRegistry
  readonly rollout: ToolRouteRollout
}

function filterHeaders(headers: Headers, allowlist: ReadonlySet<string>): Record<string, string> {
  const filtered: Record<string, string> = {}
  headers.forEach((value, name) => {
    if (allowlist.has(name.toLowerCase())) {
      filtered[name.toLowerCase()] = value
    }
  })
  return filtered
}

async function readBoundedBody(request: Request, maximumBytes: number): Promise<Uint8Array | null> {
  if (request.method === 'GET' || request.method === 'HEAD' || !request.body) {
    return null
  }
  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new RangeError('request-body-too-large')
  }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) {
        break
      }
      length += next.value.byteLength
      if (length > maximumBytes) {
        await reader.cancel('request-body-too-large')
        throw new RangeError('request-body-too-large')
      }
      chunks.push(next.value)
    }
  } finally {
    reader.releaseLock()
  }

  const body = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

function toResponse(result: ToolAdapterResult): Response {
  const headers = new Headers()
  for (const [name, value] of Object.entries(result.headers ?? {})) {
    if (responseHeaderAllowlist.has(name.toLowerCase())) {
      headers.set(name, value)
    }
  }
  return new Response(result.body ?? null, { headers, status: result.status })
}

/**
 * Owns matching, auth ordering, bounded transport, rollout, and safe error mapping
 * for all generated W4 routes while provider behavior stays behind adapters.
 */
export function createToolRouteCompatibilityHandler(
  options: ToolRouteCompatibilityHandlerOptions
): (request: Request) => Promise<Response | null> {
  const matchRoute = createToolRouteTable(options.manifest)
  const maximumBytes = options.maxRequestBodyBytes ?? 64 * 1024 * 1024

  return async (request) => {
    const url = new URL(request.url)
    const match = matchRoute(request.method, url.pathname)
    if (match.kind === 'not-found') {
      return null
    }
    if (match.kind === 'method-not-allowed') {
      return new Response(null, {
        headers: { allow: match.allow.join(', ') },
        status: 405,
      })
    }

    const access = await options.access.authorize(request, match.route)
    if (!access.allowed) {
      return access.response
    }

    let body: Uint8Array | null
    try {
      body = await readBoundedBody(request, maximumBytes)
    } catch (error) {
      if (error instanceof RangeError && error.message === 'request-body-too-large') {
        return Response.json({ error: 'Request body too large' }, { status: 413 })
      }
      throw error
    }

    const useNativeAdapter = await options.rollout.isNativeEnabled(match.route)
    const adapterRegistry = useNativeAdapter ? options.nativeAdapters : options.fallbackAdapters
    const adapter = adapterRegistry.resolve(match.route.provider)
    if (!adapter) {
      return Response.json(
        {
          error: 'Tool provider adapter unavailable',
          inventoryId: match.route.inventoryId,
        },
        { status: 501 }
      )
    }

    const invocation: ToolAdapterInvocation = {
      body,
      headers: filterHeaders(request.headers, requestHeaderAllowlist),
      method: request.method,
      path: url.pathname,
      principal: access.principal,
      query: url.search,
      route: match.route,
      upstreamAuthHeaders: access.upstreamAuthHeaders ?? {},
    }
    try {
      return toResponse(await adapter.invoke(invocation))
    } catch {
      return Response.json(
        {
          error: 'Tool provider temporarily unavailable',
          inventoryId: match.route.inventoryId,
        },
        { status: 503 }
      )
    }
  }
}

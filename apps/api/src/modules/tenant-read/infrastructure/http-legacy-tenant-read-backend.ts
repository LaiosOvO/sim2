import type { TenantReadBackend } from '@/modules/tenant-read/application/ports'

export interface HttpLegacyTenantReadBackendOptions {
  baseUrl: string
  fetcher?: typeof fetch
  timeoutMs?: number
}

function forwardHeaders(request: Request, requestId: string): Headers {
  const headers = new Headers(request.headers)
  for (const name of ['connection', 'content-length', 'host', 'transfer-encoding']) {
    headers.delete(name)
  }
  headers.set('x-request-id', requestId)
  headers.set('x-sim-migration-hop', 'api-w2-tenant-read')
  return headers
}

export function createHttpLegacyTenantReadBackend(
  options: HttpLegacyTenantReadBackendOptions
): TenantReadBackend {
  const fetcher = options.fetcher ?? fetch
  const timeoutMs = options.timeoutMs ?? 10_000
  return {
    async forward({ request, requestId }) {
      const source = new URL(request.url)
      const target = new URL(`${source.pathname}${source.search}`, options.baseUrl)
      if (target.origin === source.origin) {
        throw new Error('Refusing recursive W2 tenant-read legacy target')
      }
      const response = await fetcher(target, {
        method: 'GET',
        headers: forwardHeaders(request, requestId),
        redirect: 'manual',
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)]),
      })
      return {
        backend: 'legacy-origin-compatibility',
        response: new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        }),
      }
    },
  }
}

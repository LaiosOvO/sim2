import type {
  ProviderToolRouteAdapter,
  ToolAdapterInvocation,
  ToolAdapterResult,
} from '@/modules/tool-adapters/contracts'

const upstreamResponseHeaderAllowlist = new Set([
  'content-disposition',
  'content-type',
  'retry-after',
  'x-request-id',
])

export type HttpLegacyToolRouteAdapterOptions = {
  readonly baseUrl: string
  readonly fetch?: typeof globalThis.fetch
}

/**
 * Provides a functional strangler fallback without importing a Next route or a
 * provider SDK into the standalone API process.
 */
export class HttpLegacyToolRouteAdapter implements ProviderToolRouteAdapter {
  private readonly baseUrl: URL
  private readonly fetchImplementation: typeof globalThis.fetch

  constructor(options: HttpLegacyToolRouteAdapterOptions) {
    this.baseUrl = new URL(options.baseUrl)
    this.fetchImplementation = options.fetch ?? globalThis.fetch
  }

  async invoke(invocation: ToolAdapterInvocation): Promise<ToolAdapterResult> {
    const url = new URL(invocation.path, this.baseUrl)
    url.search = invocation.query
    const headers = new Headers(invocation.headers)
    for (const [name, value] of Object.entries(invocation.upstreamAuthHeaders)) {
      headers.set(name, value)
    }
    const body = invocation.body ? Uint8Array.from(invocation.body).buffer : null

    const response = await this.fetchImplementation(url, {
      body,
      headers,
      method: invocation.method,
    })
    const responseHeaders: Record<string, string> = {}
    response.headers.forEach((value, name) => {
      if (upstreamResponseHeaderAllowlist.has(name.toLowerCase())) {
        responseHeaders[name.toLowerCase()] = value
      }
    })
    return {
      body: response.body,
      headers: responseHeaders,
      status: response.status,
    }
  }
}

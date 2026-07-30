import { describe, expect, it, vi } from 'vitest'
import {
  HttpLegacyToolRouteAdapter,
  type ToolAdapterInvocation,
  W4_TOOL_ROUTE_MANIFEST,
} from '@/modules/tool-adapters'

describe('HTTP legacy tool route adapter', () => {
  it('calls the exact legacy contract without loading its implementation', async () => {
    const fetchImplementation = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response('legacy-ok', {
        headers: {
          'content-type': 'text/plain',
          'set-cookie': 'must-not-escape=1',
          'x-request-id': 'upstream-request',
        },
        status: 201,
      })
    })
    const adapter = new HttpLegacyToolRouteAdapter({
      baseUrl: 'http://legacy-web.internal:3000',
      fetch: fetchImplementation,
    })
    const route = W4_TOOL_ROUTE_MANIFEST[0]
    const invocation: ToolAdapterInvocation = {
      body: new TextEncoder().encode('{"taskId":"task-1"}'),
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'idem-1',
      },
      method: route.methods[0],
      path: route.pathTemplate,
      principal: { actorId: 'user-1', kind: 'user', workspaceId: 'workspace-1' },
      query: '?trace=1',
      route,
      upstreamAuthHeaders: { cookie: 'trusted-session=relay' },
    }

    const result = await adapter.invoke(invocation)

    expect(fetchImplementation).toHaveBeenCalledOnce()
    const [url, init] = fetchImplementation.mock.calls[0]
    expect(init).toBeDefined()
    if (!init) {
      throw new Error('Expected fetch request options')
    }
    expect(url.toString()).toBe(`http://legacy-web.internal:3000${route.pathTemplate}?trace=1`)
    expect(init.method).toBe(route.methods[0])
    expect(new Headers(init.headers).get('cookie')).toBe('trusted-session=relay')
    expect(new Headers(init.headers).get('idempotency-key')).toBe('idem-1')
    expect(init.body).toBeInstanceOf(ArrayBuffer)
    expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe('{"taskId":"task-1"}')
    expect(result.status).toBe(201)
    expect(result.headers).toEqual({
      'content-type': 'text/plain',
      'x-request-id': 'upstream-request',
    })
    expect(await new Response(result.body).text()).toBe('legacy-ok')
  })
})

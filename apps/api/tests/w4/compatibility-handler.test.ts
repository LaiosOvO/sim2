import { describe, expect, it, vi } from 'vitest'
import {
  createToolRouteCompatibilityHandler,
  type ProviderToolRouteAdapter,
  type ProviderToolRouteAdapterRegistry,
  type ToolAdapterInvocation,
  type ToolRouteAccess,
  type ToolRouteRollout,
  W4_TOOL_ROUTE_MANIFEST,
} from '@/modules/tool-adapters'

function registry(adapter: ProviderToolRouteAdapter | undefined): ProviderToolRouteAdapterRegistry {
  return {
    resolve: () => adapter,
  }
}

function createAccess(allowed = true): ToolRouteAccess {
  return {
    authorize: vi.fn(async () =>
      allowed
        ? {
            allowed: true as const,
            principal: { actorId: 'user-1', kind: 'user' as const, workspaceId: 'workspace-1' },
            upstreamAuthHeaders: { 'x-internal-principal': 'signed-proof' },
          }
        : {
            allowed: false as const,
            response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
          }
    ),
  }
}

function createRollout(enabled: boolean): ToolRouteRollout {
  return {
    isNativeEnabled: vi.fn(async () => enabled),
  }
}

describe('W4 compatibility handler', () => {
  it('matches and transports all 340 A-L route contracts through an adapter', async () => {
    const invocations: ToolAdapterInvocation[] = []
    const adapter: ProviderToolRouteAdapter = {
      invoke: async (invocation) => {
        invocations.push(invocation)
        return {
          body: JSON.stringify({ inventoryId: invocation.route.inventoryId }),
          headers: { 'content-type': 'application/json' },
          status: 200,
        }
      },
    }
    const handler = createToolRouteCompatibilityHandler({
      access: createAccess(),
      fallbackAdapters: registry(undefined),
      manifest: W4_TOOL_ROUTE_MANIFEST,
      nativeAdapters: registry(adapter),
      rollout: createRollout(true),
    })

    for (const route of W4_TOOL_ROUTE_MANIFEST) {
      const method = route.methods[0]
      const response = await handler(
        new Request(`http://api.test${route.pathTemplate}?contract=1`, {
          body: method === 'GET' ? undefined : '{}',
          headers: { 'content-type': 'application/json', 'idempotency-key': route.inventoryId },
          method,
        })
      )
      expect(response?.status).toBe(200)
    }

    expect(invocations).toHaveLength(340)
    expect(invocations.map((invocation) => invocation.route.inventoryId)).toEqual(
      W4_TOOL_ROUTE_MANIFEST.map((route) => route.inventoryId)
    )
  })

  it('authorizes before resolving or invoking an adapter', async () => {
    const invoke = vi.fn()
    const resolve = vi.fn(() => ({ invoke }))
    const handler = createToolRouteCompatibilityHandler({
      access: createAccess(false),
      fallbackAdapters: { resolve },
      manifest: W4_TOOL_ROUTE_MANIFEST,
      nativeAdapters: { resolve },
      rollout: createRollout(true),
    })
    const route = W4_TOOL_ROUTE_MANIFEST[0]

    const response = await handler(
      new Request(`http://api.test${route.pathTemplate}`, {
        body: '{}',
        method: route.methods[0],
      })
    )

    expect(response?.status).toBe(401)
    expect(resolve).not.toHaveBeenCalled()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('strips browser credentials while preserving idempotency and trusted auth proof', async () => {
    let capturedInvocation: ToolAdapterInvocation | undefined
    const invoke = vi.fn(async (invocation: ToolAdapterInvocation) => {
      capturedInvocation = invocation
      return { status: 204 }
    })
    const handler = createToolRouteCompatibilityHandler({
      access: createAccess(),
      fallbackAdapters: registry(undefined),
      manifest: W4_TOOL_ROUTE_MANIFEST,
      nativeAdapters: registry({ invoke }),
      rollout: createRollout(true),
    })
    const route = W4_TOOL_ROUTE_MANIFEST[0]

    await handler(
      new Request(`http://api.test${route.pathTemplate}`, {
        body: '{}',
        headers: {
          authorization: 'Bearer browser-secret',
          cookie: 'session=browser-secret',
          'idempotency-key': 'idem-1',
          'x-request-id': 'request-1',
        },
        method: route.methods[0],
      })
    )

    const invocation = capturedInvocation
    expect(invocation).toBeDefined()
    if (!invocation) {
      throw new Error('Expected adapter invocation')
    }
    expect(invocation.headers).toEqual({
      'content-type': 'text/plain;charset=UTF-8',
      'idempotency-key': 'idem-1',
      'x-request-id': 'request-1',
    })
    expect(invocation.upstreamAuthHeaders).toEqual({
      'x-internal-principal': 'signed-proof',
    })
  })

  it('supports provider-scoped rollback to a functional fallback adapter', async () => {
    const nativeInvoke = vi.fn()
    const fallbackInvoke = vi.fn(async () => ({
      body: 'legacy-result',
      headers: { 'content-type': 'text/plain', 'set-cookie': 'blocked=1' },
      status: 202,
    }))
    const handler = createToolRouteCompatibilityHandler({
      access: createAccess(),
      fallbackAdapters: registry({ invoke: fallbackInvoke }),
      manifest: W4_TOOL_ROUTE_MANIFEST,
      nativeAdapters: registry({ invoke: nativeInvoke }),
      rollout: createRollout(false),
    })
    const route = W4_TOOL_ROUTE_MANIFEST[0]

    const response = await handler(
      new Request(`http://api.test${route.pathTemplate}`, {
        body: '{}',
        method: route.methods[0],
      })
    )

    expect(response?.status).toBe(202)
    expect(await response?.text()).toBe('legacy-result')
    expect(response?.headers.get('set-cookie')).toBeNull()
    expect(fallbackInvoke).toHaveBeenCalledOnce()
    expect(nativeInvoke).not.toHaveBeenCalled()
  })

  it('maps body limits, missing adapters, provider failures, and method mismatches safely', async () => {
    const route = W4_TOOL_ROUTE_MANIFEST[0]
    const failingAdapter: ProviderToolRouteAdapter = {
      invoke: async () => {
        throw new Error('provider secret')
      },
    }
    const common = {
      access: createAccess(),
      fallbackAdapters: registry(undefined),
      manifest: W4_TOOL_ROUTE_MANIFEST,
      rollout: createRollout(true),
    }

    const oversized = await createToolRouteCompatibilityHandler({
      ...common,
      maxRequestBodyBytes: 1,
      nativeAdapters: registry(failingAdapter),
    })(
      new Request(`http://api.test${route.pathTemplate}`, {
        body: '{}',
        method: route.methods[0],
      })
    )
    const missing = await createToolRouteCompatibilityHandler({
      ...common,
      nativeAdapters: registry(undefined),
    })(
      new Request(`http://api.test${route.pathTemplate}`, {
        body: '{}',
        method: route.methods[0],
      })
    )
    const failed = await createToolRouteCompatibilityHandler({
      ...common,
      nativeAdapters: registry(failingAdapter),
    })(
      new Request(`http://api.test${route.pathTemplate}`, {
        body: '{}',
        method: route.methods[0],
      })
    )
    const wrongMethod = await createToolRouteCompatibilityHandler({
      ...common,
      nativeAdapters: registry(failingAdapter),
    })(new Request(`http://api.test${route.pathTemplate}`, { method: 'OPTIONS' }))

    expect(oversized?.status).toBe(413)
    expect(missing?.status).toBe(501)
    expect(failed?.status).toBe(503)
    expect(await failed?.text()).not.toContain('provider secret')
    expect(wrongMethod?.status).toBe(405)
    expect(wrongMethod?.headers.get('allow')).toContain(route.methods[0])
  })
})

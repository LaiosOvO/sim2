import { createLogger } from '@sim/logger'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { selectorGatewayContract } from '@/lib/api/contracts/selector-gateway'
import { parseRequest } from '@/lib/api/server'
import { withApiRequestTransport } from '@/lib/api/server/request-transport-context'
import { getSession } from '@/lib/auth'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { getEffectiveDecryptedEnv } from '@/lib/environment/utils'
import { checkWorkspaceAccess } from '@/lib/workspaces/permissions/utils'
import { loadSelectorDefinition } from '@/hooks/selectors/lazy-registry'
import { loadAllSelectorOptions } from '@/hooks/selectors/load-options'

export const dynamic = 'force-dynamic'

const logger = createLogger('SelectorGatewayAPI')

export function createInternalRequestTransport(request: NextRequest) {
  // Never derive the server-side fetch destination from the public Host header.
  // Provider selectors only call this Next process's own contract routes.
  const origin = new URL(
    process.env.SIM_NEXT_INTERNAL_URL ?? `http://127.0.0.1:${process.env.PORT ?? '3000'}`
  ).origin
  const forwardedHeaders = ['authorization', 'cookie'] as const

  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const sourceUrl =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const target = new URL(sourceUrl, origin)
    if (target.origin !== origin) {
      throw new Error('Selector gateway only permits same-origin contract requests')
    }

    const headers = new Headers(input instanceof Request ? input.headers : undefined)
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value))
    for (const name of forwardedHeaders) {
      const value = request.headers.get(name)
      if (value && !headers.has(name)) headers.set(name, value)
    }

    const forwardedInput = input instanceof Request ? new Request(target, input) : target
    return globalThis.fetch(forwardedInput, {
      ...init,
      cache: 'no-store',
      headers,
    })
  }
}

async function resolveEnvironmentReferences(
  context: Record<string, string | undefined>,
  userId: string
): Promise<Record<string, string | undefined>> {
  const references = Object.entries(context).filter(
    ([, value]) => typeof value === 'string' && /^\{\{[^{}]+\}\}$/.test(value)
  )
  if (references.length === 0) return context

  const environment = await getEffectiveDecryptedEnv(userId, context.workspaceId)
  const resolved = { ...context }
  for (const [key, reference] of references) {
    const name = reference?.slice(2, -2)
    const value = name ? environment[name] : undefined
    if (value) resolved[key] = value
    else delete resolved[key]
  }
  return resolved
}

export const POST = withRouteHandler(async (request: NextRequest) => {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = await parseRequest(selectorGatewayContract, request, {})
  if (!parsed.success) return parsed.response

  const { selectorKey, context, detailId, search } = parsed.data.body
  const workspaceAccess = await checkWorkspaceAccess(context.workspaceId, session.user.id)
  if (!workspaceAccess.hasAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const definition = await loadSelectorDefinition(selectorKey)
  if (!definition) {
    return NextResponse.json({ error: 'Unknown selector key' }, { status: 400 })
  }

  const resolvedContext = await resolveEnvironmentReferences(context, session.user.id)
  const args = { key: definition.key, context: resolvedContext, detailId, search }
  if (definition.enabled && !definition.enabled(args)) {
    return NextResponse.json({ items: [] })
  }

  try {
    const items = await withApiRequestTransport(
      createInternalRequestTransport(request),
      async () => {
        if (detailId && definition.fetchById) {
          const item = await definition.fetchById(args)
          return item ? [item] : []
        }
        return loadAllSelectorOptions(definition, args)
      }
    )

    return NextResponse.json({
      items: items.map(({ id, label }) => ({ id, label })),
    })
  } catch (error) {
    logger.warn('Provider selector query failed', {
      selectorKey,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Unable to load provider resources' }, { status: 502 })
  }
})

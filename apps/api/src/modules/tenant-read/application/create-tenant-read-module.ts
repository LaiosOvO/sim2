import {
  type W2TenantReadAuthMode,
  type W2TenantReadRouteContract,
  w2TenantReadRouteContracts,
} from '@sim/api-contracts/w2-tenant-read'
import type { RequestAuthenticationPolicy, RequestAuthenticator } from '@sim/auth/request-context'
import type { ApiRequestContext } from '@/http/request-context'
import type { TenantReadCompatibilityBackend } from './ports'

export interface TenantReadModule {
  handle(request: Request, context: ApiRequestContext): Promise<Response | undefined>
}

export interface TenantReadModuleDependencies {
  authentication: RequestAuthenticator
  backend: TenantReadCompatibilityBackend
}

interface CompiledRoute {
  contract: W2TenantReadRouteContract
  pattern: RegExp
}

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function compilePathTemplate(template: string): RegExp {
  const pattern = template
    .split('/')
    .map((segment) => (/^\[[^\]]+\]$/.test(segment) ? '[^/]+' : escapePattern(segment)))
    .join('/')
  return new RegExp(`^${pattern}$`)
}

const compiledRoutes: readonly CompiledRoute[] = w2TenantReadRouteContracts.map((contract) => ({
  contract,
  pattern: compilePathTemplate(contract.pathTemplate),
}))

function authenticationPolicy(mode: W2TenantReadAuthMode): RequestAuthenticationPolicy | undefined {
  if (mode === 'session') return { mode: 'session' }
  if (mode === 'hybrid-all') {
    return {
      mode: 'hybrid',
      allowed: ['session', 'api-key', 'internal'],
      internalActor: 'either',
    }
  }
  if (mode === 'session-internal') {
    return {
      mode: 'hybrid',
      allowed: ['session', 'internal'],
      internalActor: 'either',
    }
  }
  return undefined
}

function authenticationFailure(status: number): Response {
  return Response.json(
    { error: status === 503 ? 'Service unavailable' : 'Unauthorized' },
    { status }
  )
}

function withObservationHeaders(response: Response, route: W2TenantReadRouteContract): Response {
  const headers = new Headers(response.headers)
  headers.set('x-sim-api-module', 'tenant-read-compatibility')
  headers.set('x-sim-api-inventory-id', route.inventoryId)
  headers.set('x-sim-api-backend', 'legacy-origin')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

/**
 * W2 tenant-read strangler module. It owns route selection, authentication
 * policy and observability while the backend port is progressively replaced
 * from an HTTP legacy origin by native repositories.
 */
export function createTenantReadModule(
  dependencies: TenantReadModuleDependencies
): TenantReadModule {
  return {
    async handle(request, context) {
      if (request.method !== 'GET') return undefined
      const pathname = new URL(request.url).pathname
      const route = compiledRoutes.find(({ pattern }) => pattern.test(pathname))?.contract
      if (!route) return undefined

      const policy = authenticationPolicy(route.authMode)
      if (policy) {
        const authentication = await dependencies.authentication.authenticate({
          request,
          requestId: context.requestId,
          policy,
        })
        if (!authentication.ok) return authenticationFailure(authentication.error.status)
      }

      try {
        const response = await dependencies.backend.forward({
          request,
          requestId: context.requestId,
          route,
        })
        return withObservationHeaders(response, route)
      } catch {
        return withObservationHeaders(
          Response.json(
            { error: 'Tenant read backend unavailable' },
            { status: 503, headers: { 'retry-after': '1' } }
          ),
          route
        )
      }
    },
  }
}

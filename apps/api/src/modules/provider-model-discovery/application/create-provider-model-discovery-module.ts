import {
  type ProviderModelDiscoveryRouteIdV1,
  providerModelDiscoveryRoutesV1,
} from '@sim/api-contracts/provider-model-discovery'
import type { RequestAuthenticator } from '@sim/auth/request-context'
import { createLogger } from '@sim/logger'
import type { ApiRequestContext } from '@/http/request-context'
import type { DiscoverProviderModelsUseCase } from '@/modules/provider-model-discovery/application/discover-provider-models'

const logger = createLogger('ProviderModelDiscoveryAPI')
const routeByPath = new Map<string, (typeof providerModelDiscoveryRoutesV1)[number]>(
  providerModelDiscoveryRoutesV1.map((route) => [route.path, route])
)
const allowedMethods = 'GET, HEAD, OPTIONS'

export interface ProviderModelDiscoveryModule {
  handle(request: Request, context: ApiRequestContext): Promise<Response | undefined>
}

export interface ProviderModelDiscoveryModuleDependencies {
  readonly authentication?: RequestAuthenticator
  readonly discover: DiscoverProviderModelsUseCase
}

function withObservationHeaders(
  response: Response,
  inventoryId: ProviderModelDiscoveryRouteIdV1,
  suppressBody = false
): Response {
  const headers = new Headers(response.headers)
  headers.set('x-sim-api-backend', 'native')
  headers.set('x-sim-api-inventory-id', inventoryId)
  headers.set('x-sim-api-module', 'provider-model-discovery')
  return new Response(suppressBody ? null : response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  })
}

export function createProviderModelDiscoveryModule(
  dependencies: ProviderModelDiscoveryModuleDependencies
): ProviderModelDiscoveryModule {
  return {
    async handle(request, context) {
      const url = new URL(request.url)
      const route = routeByPath.get(url.pathname)
      if (!route) return undefined
      if (request.method === 'OPTIONS') {
        return withObservationHeaders(
          new Response(null, {
            headers: { Allow: allowedMethods },
            status: 204,
          }),
          route.inventoryId
        )
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return withObservationHeaders(
          new Response(null, {
            status: 405,
          }),
          route.inventoryId
        )
      }

      try {
        const result = await dependencies.discover.execute({
          provider: route.provider,
          ...(url.searchParams.has('workspaceId')
            ? { rawWorkspaceId: url.searchParams.get('workspaceId') ?? '' }
            : {}),
          resolveSessionActorId: async () => {
            if (!dependencies.authentication) return undefined
            const authentication = await dependencies.authentication.authenticate({
              policy: { mode: 'session' },
              request,
              requestId: context.requestId,
            })
            return authentication.ok &&
              authentication.context.authenticationMethod === 'session' &&
              authentication.context.actor.type === 'user'
              ? authentication.context.actor.id
              : undefined
          },
          signal: request.signal,
        })
        return withObservationHeaders(
          Response.json(result.body, { status: result.status }),
          route.inventoryId,
          request.method === 'HEAD'
        )
      } catch (error) {
        logger.error('Provider model discovery failed before upstream error folding', {
          error,
          inventoryId: route.inventoryId,
          provider: route.provider,
          requestId: context.requestId,
        })
        return withObservationHeaders(
          Response.json(
            { error: 'Internal server error', requestId: context.requestId },
            { status: 500 }
          ),
          route.inventoryId,
          request.method === 'HEAD'
        )
      }
    },
  }
}

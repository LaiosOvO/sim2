import type { RequestAuthenticator } from '@sim/auth/request-context'
import type { ApiRequestContext } from '@/http/request-context'
import type { GetPausedExecutionHandler } from '@/modules/execution/read/interface/create-get-paused-execution-handler'
import type { ListPausedExecutionsHandler } from '@/modules/execution/read/interface/create-list-paused-executions-handler'

export interface ExecutionReadModule {
  handle(request: Request, context: ApiRequestContext): Promise<Response | undefined>
}

export interface ExecutionReadModuleDependencies {
  authentication: RequestAuthenticator
  getPausedExecution: GetPausedExecutionHandler
  listPausedExecutions: ListPausedExecutionsHandler
}

interface Route {
  inventoryId: 'API-0282' | 'API-0996' | 'API-0997'
  pattern: RegExp
  handler: GetPausedExecutionHandler | ListPausedExecutionsHandler
}

function observed(response: Response, inventoryId: Route['inventoryId']): Response {
  const headers = new Headers(response.headers)
  headers.set('x-sim-api-module', 'execution-read')
  headers.set('x-sim-api-inventory-id', inventoryId)
  headers.set('x-sim-api-backend', 'native')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

/**
 * Three-route W6 read boundary. It owns exact route selection and the shared
 * hybrid identity policy while detail/list behavior remains behind two deep
 * handlers. Heavy execution implementations are not reachable here.
 */
export function createExecutionReadModule(
  dependencies: ExecutionReadModuleDependencies
): ExecutionReadModule {
  const routes: readonly Route[] = [
    {
      inventoryId: 'API-0282',
      pattern: /^\/api\/resume\/[^/]+\/[^/]+$/,
      handler: dependencies.getPausedExecution,
    },
    {
      inventoryId: 'API-0996',
      pattern: /^\/api\/workflows\/[^/]+\/paused\/[^/]+$/,
      handler: dependencies.getPausedExecution,
    },
    {
      inventoryId: 'API-0997',
      pattern: /^\/api\/workflows\/[^/]+\/paused$/,
      handler: dependencies.listPausedExecutions,
    },
  ]

  return {
    async handle(request, context) {
      const pathname = new URL(request.url).pathname
      const route = routes.find((candidate) => candidate.pattern.test(pathname))
      if (!route) return undefined
      if (request.method !== 'GET') return undefined

      const authentication = await dependencies.authentication.authenticate({
        request,
        requestId: context.requestId,
        policy: {
          mode: 'hybrid',
          allowed: ['session', 'api-key', 'internal'],
          internalActor: 'either',
        },
      })
      if (!authentication.ok) {
        return observed(
          Response.json(
            { error: authentication.error.message ?? 'Authentication required' },
            { status: authentication.error.status }
          ),
          route.inventoryId
        )
      }

      const response = await route.handler({
        request,
        authenticationContext: authentication.context,
        requestId: context.requestId,
      })
      return observed(response, route.inventoryId)
    },
  }
}

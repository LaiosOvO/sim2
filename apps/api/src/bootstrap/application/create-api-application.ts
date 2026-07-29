import { API_CONTRACTS_VERSION, apiErrorEnvelopeSchema } from '@sim/api-contracts'
import { createRequestContext, withApiHeaders } from '@/http/request-context'
import type { EnvironmentModule } from '@/modules/environment/application/create-environment-module'
import {
  createStatusModule,
  type StatusModule,
} from '@/modules/status/application/create-status-module'
import { createSystemModule } from '@/modules/system/application/create-system-module'

export interface ApiApplication {
  handle(request: Request): Promise<Response>
}

export interface ApiApplicationOptions {
  serviceName?: string
  now?: () => Date
  environment?: EnvironmentModule
  status?: StatusModule
  readinessChecks?: Readonly<Record<string, () => Promise<boolean>>>
}

/**
 * Creates the transport-independent API module. HTTP servers and tests cross
 * this interface instead of reaching into route implementations.
 */
export function createApiApplication(options: ApiApplicationOptions = {}): ApiApplication {
  const serviceName = options.serviceName ?? 'sim-api'
  const system = createSystemModule({
    serviceName,
    now: options.now,
    readinessChecks: options.readinessChecks,
  })
  const status = options.status ?? createStatusModule({ now: options.now })
  const handlers = [system, status, ...(options.environment ? [options.environment] : [])]

  return {
    async handle(request) {
      const context = createRequestContext(request)
      try {
        for (const handler of handlers) {
          const response = await handler.handle(request)
          if (response) return withApiHeaders(response, context)
        }

        const body = apiErrorEnvelopeSchema.parse({
          contractVersion: API_CONTRACTS_VERSION,
          error: {
            code: 'not_found',
            message: 'Route not found',
            status: 404,
            retryable: false,
            details: { service: serviceName },
          },
        })
        return withApiHeaders(Response.json(body, { status: 404 }), context)
      } catch {
        const body = apiErrorEnvelopeSchema.parse({
          contractVersion: API_CONTRACTS_VERSION,
          error: {
            code: 'internal_error',
            message: 'Internal server error',
            status: 500,
            retryable: false,
            details: { service: serviceName },
          },
        })
        return withApiHeaders(Response.json(body, { status: 500 }), context)
      }
    },
  }
}

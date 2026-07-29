import { API_CONTRACTS_VERSION, apiErrorEnvelopeSchema } from '@sim/api-contracts'

export interface ApiApplication {
  handle(request: Request): Promise<Response>
}

export interface ApiApplicationOptions {
  serviceName?: string
}

/**
 * Creates the transport-independent API module. HTTP servers and tests cross
 * this interface instead of reaching into route implementations.
 */
export function createApiApplication(options: ApiApplicationOptions = {}): ApiApplication {
  const serviceName = options.serviceName ?? 'sim-api'

  return {
    async handle() {
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
      return Response.json(body, { status: 404 })
    },
  }
}

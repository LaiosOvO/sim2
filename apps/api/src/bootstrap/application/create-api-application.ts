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
      return Response.json(
        {
          error: 'not_found',
          service: serviceName,
        },
        { status: 404 }
      )
    },
  }
}

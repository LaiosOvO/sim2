import {
  API_CONTRACTS_VERSION,
  apiVersionResponseSchema,
  healthResponseSchema,
  readinessResponseSchema,
} from '@sim/api-contracts'
import { EXECUTION_CONTRACTS_VERSION } from '@sim/execution-contracts'

export interface SystemModule {
  handle(request: Request): Promise<Response | undefined>
}

export interface SystemModuleOptions {
  serviceName: string
  now?: () => Date
  readinessChecks?: Readonly<Record<string, () => Promise<boolean>>>
}

export function createSystemModule(options: SystemModuleOptions): SystemModule {
  const now = options.now ?? (() => new Date())
  const readinessChecks = options.readinessChecks ?? {}

  return {
    async handle(request) {
      const { pathname } = new URL(request.url)
      if (request.method !== 'GET') return undefined

      if (pathname === '/api/health' || pathname === '/internal/live') {
        return Response.json(
          healthResponseSchema.parse({
            status: 'ok',
            timestamp: now().toISOString(),
          })
        )
      }

      if (pathname === '/internal/version') {
        return Response.json(
          apiVersionResponseSchema.parse({
            contractVersion: API_CONTRACTS_VERSION,
            service: options.serviceName,
            apiContractsVersion: API_CONTRACTS_VERSION,
            executionContractsVersion: EXECUTION_CONTRACTS_VERSION,
          })
        )
      }

      if (pathname === '/internal/ready') {
        const entries = await Promise.all(
          Object.entries(readinessChecks).map(async ([name, check]) => {
            try {
              return [name, await check()] as const
            } catch {
              return [name, false] as const
            }
          })
        )
        const checks = Object.fromEntries(entries)
        const ready = Object.values(checks).every(Boolean)
        return Response.json(
          readinessResponseSchema.parse({
            contractVersion: API_CONTRACTS_VERSION,
            status: ready ? 'ready' : 'not-ready',
            checks,
          }),
          { status: ready ? 200 : 503 }
        )
      }

      return undefined
    },
  }
}

import { API_CONTRACTS_VERSION, apiErrorEnvelopeSchema } from '@sim/api-contracts'
import type { ApiRequestContext } from '@/http/request-context'
import { createRequestContext, withApiHeaders } from '@/http/request-context'
import type { ApprovalsModule } from '@/modules/approvals'
import type { CustomBlockModule } from '@/modules/custom-blocks'
import type { EnvironmentModule } from '@/modules/environment/application/create-environment-module'
import type { ExecutionAdmissionModule } from '@/modules/execution/application/create-execution-admission-module'
import type { ExecutionControlModule } from '@/modules/execution/control'
import type { ExecutionReadModule } from '@/modules/execution/read/application/create-execution-read-module'
import type { ProviderModelDiscoveryModule } from '@/modules/provider-model-discovery'
import {
  createStatusModule,
  type StatusModule,
} from '@/modules/status/application/create-status-module'
import { createSystemModule } from '@/modules/system/application/create-system-module'
import type { TenantReadModule } from '@/modules/tenant-read/application/create-tenant-read-module'

export interface ApiApplication {
  handle(request: Request): Promise<Response>
}

export interface ApiApplicationOptions {
  serviceName?: string
  now?: () => Date
  approvals?: ApprovalsModule
  customBlocks?: CustomBlockModule
  environment?: EnvironmentModule
  executionAdmission?: ExecutionAdmissionModule
  executionControl?: ExecutionControlModule
  executionRead?: ExecutionReadModule
  providerModelDiscovery?: ProviderModelDiscoveryModule
  tenantRead?: TenantReadModule
  status?: StatusModule
  readinessChecks?: Readonly<Record<string, () => Promise<boolean>>>
}

interface ApiHandler {
  handle(request: Request, context: ApiRequestContext): Promise<Response | undefined>
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
  const handlers: ApiHandler[] = [
    system,
    status,
    ...(options.approvals ? [options.approvals] : []),
    ...(options.customBlocks ? [options.customBlocks] : []),
    ...(options.environment ? [options.environment] : []),
    ...(options.executionControl ? [options.executionControl] : []),
    ...(options.executionRead ? [options.executionRead] : []),
    ...(options.providerModelDiscovery ? [options.providerModelDiscovery] : []),
    ...(options.tenantRead ? [options.tenantRead] : []),
    ...(options.executionAdmission ? [options.executionAdmission] : []),
  ]

  return {
    async handle(request) {
      const context = createRequestContext(request)
      try {
        for (const handler of handlers) {
          const response = await handler.handle(request, context)
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

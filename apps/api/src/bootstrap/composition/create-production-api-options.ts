import type { RequestAuthenticator } from '@sim/auth/request-context'
import type { ApiApplicationOptions } from '@/bootstrap/application/create-api-application'
import {
  createEnvironmentModule,
  type EnvironmentModule,
} from '@/modules/environment/application/create-environment-module'
import type { ExecutionAdmissionModule } from '@/modules/execution/application/create-execution-admission-module'
import type { TenantReadModule } from '@/modules/tenant-read/application/create-tenant-read-module'

function unavailableEnvironmentModule(): EnvironmentModule {
  return {
    async handle(request) {
      const { pathname } = new URL(request.url)
      if (pathname !== '/api/environment' || !['GET', 'POST'].includes(request.method)) {
        return undefined
      }
      return Response.json({ error: 'Service unavailable' }, { status: 503 })
    },
  }
}

async function createExecutionAdmission(): Promise<ExecutionAdmissionModule | undefined> {
  const baseUrl = process.env.WORKER_ADMISSION_URL?.trim()
  const internalToken = process.env.INTERNAL_EXECUTION_TOKEN?.trim()
  if (!baseUrl || !internalToken) return undefined
  const [{ createExecutionAdmissionModule }, { createHttpWorkerJobSubmitter }] = await Promise.all([
    import('@/modules/execution/application/create-execution-admission-module'),
    import('@/modules/execution/infrastructure/http-worker-job-submitter'),
  ])
  return createExecutionAdmissionModule({
    internalToken,
    submitter: createHttpWorkerJobSubmitter({ baseUrl, internalToken }),
  })
}

async function createAuthentication(
  secret: string | undefined,
  baseURL: string | undefined
): Promise<RequestAuthenticator> {
  if (!process.env.DATABASE_URL || !secret || !baseURL) {
    const { createRequestAuthenticator } = await import('@sim/auth/request-context')
    return createRequestAuthenticator({})
  }
  const [{ createSessionAuth }, { createProductionRequestAuthenticator }] = await Promise.all([
    import('@sim/auth/session'),
    import('@/middleware/authentication/composition/create-production-request-authenticator'),
  ])
  return createProductionRequestAuthenticator({
    sessionAuth: createSessionAuth({ secret, baseURL }),
    internalSecret:
      process.env.INTERNAL_JWT_SECRET?.trim() || process.env.INTERNAL_API_SECRET?.trim(),
  })
}

async function createTenantRead(
  authentication: RequestAuthenticator
): Promise<TenantReadModule | undefined> {
  const baseUrl = process.env.SIM_LEGACY_API_BASE_URL?.trim()
  if (!baseUrl) return undefined
  const [{ createTenantReadModule }, { createHttpLegacyTenantReadBackend }] = await Promise.all([
    import('@/modules/tenant-read/application/create-tenant-read-module'),
    import('@/modules/tenant-read/infrastructure/http-legacy-tenant-read-backend'),
  ])
  return createTenantReadModule({
    authentication,
    backend: createHttpLegacyTenantReadBackend({ baseUrl }),
  })
}

function unconfiguredOptions(
  executionAdmission?: ExecutionAdmissionModule,
  tenantRead?: TenantReadModule
): ApiApplicationOptions {
  return {
    serviceName: 'sim-api',
    environment: unavailableEnvironmentModule(),
    executionAdmission,
    tenantRead,
    readinessChecks: {
      configuration: async () => false,
      database: async () => false,
    },
  }
}

export async function createProductionApiOptions(): Promise<ApiApplicationOptions> {
  const executionAdmission = await createExecutionAdmission()
  const secret = process.env.BETTER_AUTH_SECRET?.trim()
  const baseURL = process.env.BETTER_AUTH_URL?.trim() ?? process.env.NEXT_PUBLIC_APP_URL?.trim()
  const encryptionKey = process.env.ENCRYPTION_KEY?.trim()
  const configured = Boolean(
    process.env.DATABASE_URL && secret && baseURL && /^[0-9a-f]{64}$/i.test(encryptionKey ?? '')
  )
  const tenantReadConfigured = Boolean(process.env.SIM_LEGACY_API_BASE_URL?.trim())
  const authentication =
    configured || tenantReadConfigured ? await createAuthentication(secret, baseURL) : undefined
  const tenantRead =
    tenantReadConfigured && authentication ? await createTenantRead(authentication) : undefined
  if (!configured) return unconfiguredOptions(executionAdmission, tenantRead)
  if (!authentication) throw new Error('Authentication composition is unavailable')

  const [
    { db },
    { sql },
    { createAesEnvironmentSecretCipher },
    { createAuditEnvironmentSink },
    { createDrizzleEnvironmentRepository },
    { createPersonalEnvironmentCredentialSync },
    { createPostHogEnvironmentEventSink },
  ] = await Promise.all([
    import('@sim/db'),
    import('drizzle-orm'),
    import('@/modules/environment/infrastructure/aes-environment-secret-cipher'),
    import('@/modules/environment/infrastructure/audit-environment-sink'),
    import('@/modules/environment/infrastructure/drizzle-environment-repository'),
    import('@/modules/environment/infrastructure/personal-environment-credential-sync'),
    import('@/modules/environment/infrastructure/posthog-environment-event-sink'),
  ])

  const environment = createEnvironmentModule({
    authentication,
    repository: createDrizzleEnvironmentRepository(),
    cipher: createAesEnvironmentSecretCipher(encryptionKey!),
    credentials: createPersonalEnvironmentCredentialSync(),
    audit: createAuditEnvironmentSink(),
    events: createPostHogEnvironmentEventSink(),
  })

  return {
    serviceName: 'sim-api',
    environment,
    executionAdmission,
    tenantRead,
    readinessChecks: {
      configuration: async () => true,
      database: async () => {
        await db.execute(sql`select 1`)
        return true
      },
    },
  }
}

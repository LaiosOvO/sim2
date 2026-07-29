import type { ApiApplicationOptions } from '@/bootstrap/application/create-api-application'
import {
  createEnvironmentModule,
  type EnvironmentModule,
} from '@/modules/environment/application/create-environment-module'
import type { ExecutionAdmissionModule } from '@/modules/execution/application/create-execution-admission-module'

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

function unconfiguredOptions(executionAdmission?: ExecutionAdmissionModule): ApiApplicationOptions {
  return {
    serviceName: 'sim-api',
    environment: unavailableEnvironmentModule(),
    executionAdmission,
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
  if (!configured) return unconfiguredOptions(executionAdmission)

  const [
    { db },
    { createSessionAuth },
    { sql },
    { createAesEnvironmentSecretCipher },
    { createAuditEnvironmentSink },
    { createProductionRequestAuthenticator },
    { createDrizzleEnvironmentRepository },
    { createPersonalEnvironmentCredentialSync },
    { createPostHogEnvironmentEventSink },
  ] = await Promise.all([
    import('@sim/db'),
    import('@sim/auth/session'),
    import('drizzle-orm'),
    import('@/modules/environment/infrastructure/aes-environment-secret-cipher'),
    import('@/modules/environment/infrastructure/audit-environment-sink'),
    import('@/middleware/authentication/composition/create-production-request-authenticator'),
    import('@/modules/environment/infrastructure/drizzle-environment-repository'),
    import('@/modules/environment/infrastructure/personal-environment-credential-sync'),
    import('@/modules/environment/infrastructure/posthog-environment-event-sink'),
  ])

  const authentication = createProductionRequestAuthenticator({
    sessionAuth: createSessionAuth({ secret: secret!, baseURL: baseURL! }),
    internalSecret:
      process.env.INTERNAL_JWT_SECRET?.trim() || process.env.INTERNAL_API_SECRET?.trim(),
  })
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
    readinessChecks: {
      configuration: async () => true,
      database: async () => {
        await db.execute(sql`select 1`)
        return true
      },
    },
  }
}

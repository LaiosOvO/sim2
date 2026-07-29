import type { ApiApplicationOptions } from '@/bootstrap/application/create-api-application'
import {
  createEnvironmentModule,
  type EnvironmentModule,
} from '@/modules/environment/application/create-environment-module'

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

function unconfiguredOptions(): ApiApplicationOptions {
  return {
    serviceName: 'sim-api',
    environment: unavailableEnvironmentModule(),
    readinessChecks: {
      configuration: async () => false,
      database: async () => false,
    },
  }
}

export async function createProductionApiOptions(): Promise<ApiApplicationOptions> {
  const secret = process.env.BETTER_AUTH_SECRET?.trim()
  const baseURL = process.env.BETTER_AUTH_URL?.trim() ?? process.env.NEXT_PUBLIC_APP_URL?.trim()
  const encryptionKey = process.env.ENCRYPTION_KEY?.trim()
  const configured = Boolean(
    process.env.DATABASE_URL && secret && baseURL && /^[0-9a-f]{64}$/i.test(encryptionKey ?? '')
  )
  if (!configured) return unconfiguredOptions()

  const [
    { db },
    { createSessionAuth },
    { sql },
    { createAesEnvironmentSecretCipher },
    { createAuditEnvironmentSink },
    { createBetterAuthSessionResolver },
    { createDrizzleEnvironmentRepository },
    { createPersonalEnvironmentCredentialSync },
    { createPostHogEnvironmentEventSink },
  ] = await Promise.all([
    import('@sim/db'),
    import('@sim/auth/session'),
    import('drizzle-orm'),
    import('@/modules/environment/infrastructure/aes-environment-secret-cipher'),
    import('@/modules/environment/infrastructure/audit-environment-sink'),
    import('@/modules/environment/infrastructure/better-auth-session-resolver'),
    import('@/modules/environment/infrastructure/drizzle-environment-repository'),
    import('@/modules/environment/infrastructure/personal-environment-credential-sync'),
    import('@/modules/environment/infrastructure/posthog-environment-event-sink'),
  ])

  const environment = createEnvironmentModule({
    sessions: createBetterAuthSessionResolver(
      createSessionAuth({ secret: secret!, baseURL: baseURL! })
    ),
    repository: createDrizzleEnvironmentRepository(),
    cipher: createAesEnvironmentSecretCipher(encryptionKey!),
    credentials: createPersonalEnvironmentCredentialSync(),
    audit: createAuditEnvironmentSink(),
    events: createPostHogEnvironmentEventSink(),
  })

  return {
    serviceName: 'sim-api',
    environment,
    readinessChecks: {
      configuration: async () => true,
      database: async () => {
        await db.execute(sql`select 1`)
        return true
      },
    },
  }
}

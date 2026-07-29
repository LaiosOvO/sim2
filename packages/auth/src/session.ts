import { db } from '@sim/db'
import * as schema from '@sim/db/schema'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'

export interface SessionAuthOptions {
  /** Better Auth shared secret. Must match the Web application's secret. */
  secret: string
  /** Public Better Auth base URL used when validating cookie configuration. */
  baseURL: string
}

export interface ServiceSession {
  user: {
    id: string
    name: string | null
    email: string | null
    image?: string | null
  }
  session: {
    activeOrganizationId?: string | null
  }
}

export interface SessionAuth {
  getSession(headers: Headers): Promise<ServiceSession | null>
}

/**
 * Minimal cookie-session verifier for non-Web services. It deliberately
 * exposes only a stable service contract rather than Better Auth internals.
 */
export function createSessionAuth(options: SessionAuthOptions): SessionAuth {
  const auth = betterAuth({
    baseURL: options.baseURL,
    secret: options.secret,
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema,
    }),
  })

  return {
    async getSession(headers) {
      const result = await auth.api.getSession({ headers })
      if (!result?.user?.id) return null
      const session = result.session as typeof result.session & {
        activeOrganizationId?: unknown
      }
      return {
        user: {
          id: result.user.id,
          name: result.user.name ?? null,
          email: result.user.email ?? null,
          image: result.user.image ?? null,
        },
        session: {
          activeOrganizationId:
            typeof session.activeOrganizationId === 'string' ? session.activeOrganizationId : null,
        },
      }
    },
  }
}

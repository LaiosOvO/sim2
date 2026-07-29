import type { SessionAuth } from '@sim/auth/session'
import type { EnvironmentSessionResolver } from '@/modules/environment/application/ports'

export function createBetterAuthSessionResolver(auth: SessionAuth): EnvironmentSessionResolver {
  return {
    async resolve(headers) {
      const session = await auth.getSession(headers)
      if (!session) return null
      return {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
      }
    },
  }
}

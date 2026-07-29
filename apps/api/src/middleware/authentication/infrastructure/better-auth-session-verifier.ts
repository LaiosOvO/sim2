import type { SessionCredentialVerifier } from '@sim/auth/request-context'
import type { SessionAuth } from '@sim/auth/session'

export function createBetterAuthSessionVerifier(auth: SessionAuth): SessionCredentialVerifier {
  return {
    async verify(headers) {
      try {
        const session = await auth.getSession(headers)
        if (!session?.user.id) return { verified: false, reason: 'invalid' }
        return {
          verified: true,
          credential: {
            actor: {
              id: session.user.id,
              type: 'user',
              name: session.user.name,
              email: session.user.email,
            },
            sessionId: session.session.id,
            activeOrganizationId: session.session.activeOrganizationId ?? null,
          },
        }
      } catch {
        return { verified: false, reason: 'unavailable' }
      }
    },
  }
}

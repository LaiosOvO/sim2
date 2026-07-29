import { createInternalTokenVerifier } from '@sim/auth/internal-token'
import {
  createRequestAuthenticator,
  type InternalCredentialVerifier,
  type RequestAuthenticator,
} from '@sim/auth/request-context'
import type { SessionAuth } from '@sim/auth/session'
import { createBetterAuthSessionVerifier } from '@/middleware/authentication/infrastructure/better-auth-session-verifier'
import { createDrizzleApiKeyVerifier } from '@/middleware/authentication/infrastructure/drizzle-api-key-verifier'
import { createDrizzlePublicTokenVerifier } from '@/middleware/authentication/infrastructure/drizzle-public-token-verifier'

export interface ProductionRequestAuthenticatorOptions {
  sessionAuth: SessionAuth
  internalSecret?: string
}

function unavailableInternalVerifier(): InternalCredentialVerifier {
  return {
    async verify() {
      return { verified: false, reason: 'unavailable' }
    },
  }
}

export function createProductionRequestAuthenticator(
  options: ProductionRequestAuthenticatorOptions
): RequestAuthenticator {
  return createRequestAuthenticator({
    sessions: createBetterAuthSessionVerifier(options.sessionAuth),
    apiKeys: createDrizzleApiKeyVerifier(),
    publicTokens: createDrizzlePublicTokenVerifier(),
    internal: options.internalSecret
      ? createInternalTokenVerifier({ secret: options.internalSecret })
      : unavailableInternalVerifier(),
  })
}

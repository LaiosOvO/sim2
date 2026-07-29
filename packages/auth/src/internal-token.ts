import { jwtVerify } from 'jose'
import type {
  CredentialVerification,
  InternalCredential,
  InternalCredentialVerifier,
} from './request-context'

export interface InternalTokenVerifierOptions {
  secret: string
  issuer?: string
  audience?: string
}

interface InternalTokenPayload {
  type?: unknown
  userId?: unknown
  service?: unknown
  scopes?: unknown
}

/**
 * Verifies the short-lived HS256 tokens minted by the legacy Sim internal
 * auth helper. The secret fallback decision remains in service composition;
 * this module never reads process.env.
 */
export function createInternalTokenVerifier(
  options: InternalTokenVerifierOptions
): InternalCredentialVerifier {
  const secret = new TextEncoder().encode(options.secret)
  return {
    async verify(token): Promise<CredentialVerification<InternalCredential>> {
      try {
        const { payload } = await jwtVerify(token, secret, {
          issuer: options.issuer ?? 'sim-internal',
          audience: options.audience ?? 'sim-api',
        })
        const internal = payload as InternalTokenPayload
        if (internal.type !== 'internal') return { verified: false, reason: 'invalid' }
        const service =
          typeof internal.service === 'string' && internal.service.length > 0
            ? internal.service
            : 'sim-internal'
        const scopes = Array.isArray(internal.scopes)
          ? internal.scopes.filter((scope): scope is string => typeof scope === 'string')
          : []
        return {
          verified: true,
          credential: {
            actor:
              typeof internal.userId === 'string' && internal.userId.length > 0
                ? { id: internal.userId, type: 'user' }
                : { id: service, type: 'service' },
            service,
            scopes,
          },
        }
      } catch {
        return { verified: false, reason: 'invalid' }
      }
    },
  }
}

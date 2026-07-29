import {
  type ApiKeyRequestContext,
  type AuthenticatedActor,
  type AuthenticatedRequestContext,
  type AuthenticationError,
  type AuthenticationMethod,
  type RequestAuthenticationResult,
  requestAuthenticationResultSchema,
} from '@sim/api-contracts/auth'

export type CredentialFailureReason = 'invalid' | 'expired' | 'revoked' | 'unavailable'

export type CredentialVerification<T> =
  | { verified: true; credential: T }
  | { verified: false; reason: CredentialFailureReason }

export interface SessionCredential {
  actor: AuthenticatedActor & { type: 'user' }
  sessionId?: string
  activeOrganizationId: string | null
}

export interface ApiKeyCredential {
  actor: AuthenticatedActor & { type: 'user' }
  keyId: string
  keyType: 'personal' | 'workspace'
  workspaceId: string | null
}

export interface PublicTokenCredential {
  shareId: string
  workspaceId: string
  organizationId: string | null
  resourceType: string
  resourceId: string
}

export interface InternalCredential {
  actor: AuthenticatedActor & { type: 'user' | 'service' }
  service: string
  scopes: readonly string[]
}

export interface SessionCredentialVerifier {
  verify(headers: Headers): Promise<CredentialVerification<SessionCredential>>
}

export interface ApiKeyCredentialVerifier {
  verify(apiKey: string): Promise<CredentialVerification<ApiKeyCredential>>
  touch?(keyId: string): Promise<void>
}

export interface PublicTokenCredentialVerifier {
  verify(token: string): Promise<CredentialVerification<PublicTokenCredential>>
}

export interface InternalCredentialVerifier {
  verify(token: string): Promise<CredentialVerification<InternalCredential>>
}

export interface RequestAuthenticatorDependencies {
  sessions?: SessionCredentialVerifier
  apiKeys?: ApiKeyCredentialVerifier
  publicTokens?: PublicTokenCredentialVerifier
  internal?: InternalCredentialVerifier
}

export type InternalActorPolicy = 'user' | 'service' | 'either'

export type ExplicitAuthenticationPolicy =
  | { mode: 'session' }
  | { mode: 'api-key' }
  | { mode: 'public-token'; token: string }
  | { mode: 'internal'; actor: InternalActorPolicy }

export interface HybridAuthenticationPolicy {
  mode: 'hybrid'
  /**
   * There is intentionally no default allow-list. An empty list fails closed,
   * so adding the seam to a route cannot silently broaden that route.
   */
  allowed: readonly AuthenticationMethod[]
  publicToken?: string
  internalActor?: InternalActorPolicy
}

export type RequestAuthenticationPolicy = ExplicitAuthenticationPolicy | HybridAuthenticationPolicy

export interface AuthenticateRequestInput {
  request: Request
  requestId: string
  policy: RequestAuthenticationPolicy
}

export interface RequestAuthenticator {
  authenticate(input: AuthenticateRequestInput): Promise<RequestAuthenticationResult>
}

function failure(
  code: AuthenticationError['code'],
  status: AuthenticationError['status'],
  message = 'Invalid credentials',
  retryable = false
): RequestAuthenticationResult {
  return requestAuthenticationResultSchema.parse({
    ok: false,
    error: { code, message, status, retryable },
  })
}

function verificationFailure(reason: CredentialFailureReason): RequestAuthenticationResult {
  if (reason === 'unavailable') {
    return failure('authentication_unavailable', 503, 'Authentication unavailable', true)
  }
  const code =
    reason === 'expired'
      ? 'expired_credentials'
      : reason === 'revoked'
        ? 'revoked_credentials'
        : 'invalid_credentials'
  return failure(code, 401)
}

function allowedMethods(policy: RequestAuthenticationPolicy): readonly AuthenticationMethod[] {
  return policy.mode === 'hybrid' ? policy.allowed : [policy.mode]
}

function publicTokenFor(policy: RequestAuthenticationPolicy): string | undefined {
  if (policy.mode === 'public-token') return policy.token
  return policy.mode === 'hybrid' ? policy.publicToken : undefined
}

function detectedMethods(
  request: Request,
  policy: RequestAuthenticationPolicy
): AuthenticationMethod[] {
  const methods: AuthenticationMethod[] = []
  if (request.headers.has('x-api-key')) methods.push('api-key')
  if (request.headers.has('authorization')) methods.push('internal')
  if (publicTokenFor(policy)) methods.push('public-token')
  // A public-link route authenticates the path token, not an ambient browser
  // session cookie. This keeps public links usable for already signed-in users
  // without allowing fallback to that session.
  if (policy.mode !== 'public-token' && request.headers.has('cookie')) methods.push('session')
  return methods
}

function success(context: AuthenticatedRequestContext): RequestAuthenticationResult {
  return requestAuthenticationResultSchema.parse({ ok: true, context })
}

function bearerToken(headers: Headers): string {
  return headers.get('authorization')?.slice('Bearer '.length).trim() ?? ''
}

function sessionContext(
  requestId: string,
  credential: SessionCredential
): AuthenticatedRequestContext {
  return {
    authContextVersion: 1,
    requestId,
    authenticationMethod: 'session',
    actor: credential.actor,
    ...(credential.sessionId ? { credentialId: credential.sessionId } : {}),
    activeOrganizationId: credential.activeOrganizationId,
    permissions: [],
  }
}

function apiKeyContext(requestId: string, credential: ApiKeyCredential): ApiKeyRequestContext {
  return {
    authContextVersion: 1,
    requestId,
    authenticationMethod: 'api-key',
    actor: credential.actor,
    credentialId: credential.keyId,
    keyType: credential.keyType,
    workspaceId: credential.workspaceId,
    permissions: [],
  }
}

function publicTokenContext(
  requestId: string,
  credential: PublicTokenCredential
): AuthenticatedRequestContext {
  return {
    authContextVersion: 1,
    requestId,
    authenticationMethod: 'public-token',
    actor: { id: `public-share:${credential.shareId}`, type: 'public' },
    credentialId: credential.shareId,
    workspaceId: credential.workspaceId,
    organizationId: credential.organizationId,
    resourceType: credential.resourceType,
    resourceId: credential.resourceId,
    permissions: ['resource:read'],
  }
}

function internalContext(
  requestId: string,
  credential: InternalCredential
): AuthenticatedRequestContext {
  return {
    authContextVersion: 1,
    requestId,
    authenticationMethod: 'internal',
    actor: credential.actor,
    service: credential.service,
    scopes: [...credential.scopes],
    permissions: [...credential.scopes],
  }
}

function internalActorAllowed(
  policy: RequestAuthenticationPolicy,
  credential: InternalCredential
): boolean {
  const expected =
    policy.mode === 'internal'
      ? policy.actor
      : policy.mode === 'hybrid'
        ? policy.internalActor
        : undefined
  return expected === 'either' || expected === credential.actor.type
}

/**
 * Header/path-token authentication policy engine shared by the standalone API
 * and compatibility facades. It owns credential precedence and downgrade
 * prevention; concrete DB, Better Auth and JWT implementations stay behind
 * the injected verifier ports.
 */
export function createRequestAuthenticator(
  dependencies: RequestAuthenticatorDependencies
): RequestAuthenticator {
  return {
    async authenticate({ request, requestId, policy }) {
      const allowed = allowedMethods(policy)
      if (allowed.length === 0) {
        return failure('credential_not_allowed', 403, 'No authentication method is allowed')
      }
      if (policy.mode === 'hybrid' && allowed.includes('internal') && !policy.internalActor) {
        return failure('credential_not_allowed', 403, 'Internal actor policy is required')
      }

      const detected = detectedMethods(request, policy)
      if (detected.length > 1) {
        return failure('ambiguous_credentials', 401, 'Multiple credentials were supplied')
      }

      const method = detected[0]
      if (!method) return failure('missing_credentials', 401, 'Credentials required')
      if (!allowed.includes(method)) {
        return failure('credential_not_allowed', 401, 'Credential type is not allowed')
      }

      if (method === 'session') {
        if (!dependencies.sessions) return verificationFailure('unavailable')
        const verified = await dependencies.sessions.verify(request.headers)
        return verified.verified
          ? success(sessionContext(requestId, verified.credential))
          : verificationFailure(verified.reason)
      }

      if (method === 'api-key') {
        if (!dependencies.apiKeys) return verificationFailure('unavailable')
        const apiKey = request.headers.get('x-api-key')?.trim() ?? ''
        if (!apiKey) return failure('missing_credentials', 401, 'Credentials required')
        const verified = await dependencies.apiKeys.verify(apiKey)
        if (!verified.verified) return verificationFailure(verified.reason)
        await dependencies.apiKeys.touch?.(verified.credential.keyId)
        return success(apiKeyContext(requestId, verified.credential))
      }

      if (method === 'public-token') {
        if (!dependencies.publicTokens) return verificationFailure('unavailable')
        const token = publicTokenFor(policy)?.trim() ?? ''
        if (!token) return failure('missing_credentials', 401, 'Credentials required')
        const verified = await dependencies.publicTokens.verify(token)
        return verified.verified
          ? success(publicTokenContext(requestId, verified.credential))
          : verificationFailure(verified.reason)
      }

      if (!dependencies.internal) return verificationFailure('unavailable')
      const token = bearerToken(request.headers)
      if (!token) return failure('missing_credentials', 401, 'Credentials required')
      const verified = await dependencies.internal.verify(token)
      if (!verified.verified) return verificationFailure(verified.reason)
      return internalActorAllowed(policy, verified.credential)
        ? success(internalContext(requestId, verified.credential))
        : failure('credential_not_allowed', 403, 'Internal actor type is not allowed')
    },
  }
}

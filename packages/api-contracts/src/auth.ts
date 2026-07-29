import { z } from 'zod'

export const authenticationMethodSchema = z.enum(['session', 'api-key', 'public-token', 'internal'])

export const authenticatedActorSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['user', 'service', 'public']),
  name: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
})

const requestContextBaseSchema = z.object({
  authContextVersion: z.literal(1),
  requestId: z.string().min(1).max(128),
  permissions: z.array(z.string().min(1)).max(512),
})

export const sessionRequestContextSchema = requestContextBaseSchema.extend({
  authenticationMethod: z.literal('session'),
  actor: authenticatedActorSchema.extend({ type: z.literal('user') }),
  credentialId: z.string().min(1).optional(),
  activeOrganizationId: z.string().min(1).nullable(),
})

export const apiKeyRequestContextSchema = requestContextBaseSchema.extend({
  authenticationMethod: z.literal('api-key'),
  actor: authenticatedActorSchema.extend({ type: z.literal('user') }),
  credentialId: z.string().min(1),
  keyType: z.enum(['personal', 'workspace']),
  workspaceId: z.string().min(1).nullable(),
})

export const publicTokenRequestContextSchema = requestContextBaseSchema.extend({
  authenticationMethod: z.literal('public-token'),
  actor: authenticatedActorSchema.extend({ type: z.literal('public') }),
  credentialId: z.string().min(1),
  workspaceId: z.string().min(1),
  organizationId: z.string().min(1).nullable(),
  resourceType: z.string().min(1),
  resourceId: z.string().min(1),
})

export const internalRequestContextSchema = requestContextBaseSchema.extend({
  authenticationMethod: z.literal('internal'),
  actor: authenticatedActorSchema.refine(
    (actor) => actor.type === 'user' || actor.type === 'service',
    'Internal actors must be a user or service'
  ),
  service: z.string().min(1),
  scopes: z.array(z.string().min(1)).max(512),
})

export const authenticatedRequestContextSchema = z.discriminatedUnion('authenticationMethod', [
  sessionRequestContextSchema,
  apiKeyRequestContextSchema,
  publicTokenRequestContextSchema,
  internalRequestContextSchema,
])

export const authenticationErrorCodeSchema = z.enum([
  'missing_credentials',
  'invalid_credentials',
  'expired_credentials',
  'revoked_credentials',
  'ambiguous_credentials',
  'credential_not_allowed',
  'workspace_access_denied',
  'organization_access_denied',
  'workflow_access_denied',
  'resource_access_denied',
  'subject_not_found',
  'authentication_unavailable',
])

export const authenticationErrorSchema = z.object({
  code: authenticationErrorCodeSchema,
  message: z.string().min(1),
  status: z.union([z.literal(401), z.literal(403), z.literal(404), z.literal(503)]),
  retryable: z.boolean(),
})

export const requestAuthenticationSuccessSchema = z.object({
  ok: z.literal(true),
  context: authenticatedRequestContextSchema,
})

export const requestAuthenticationFailureSchema = z.object({
  ok: z.literal(false),
  error: authenticationErrorSchema,
})

export const requestAuthenticationResultSchema = z.discriminatedUnion('ok', [
  requestAuthenticationSuccessSchema,
  requestAuthenticationFailureSchema,
])

export type AuthenticationMethod = z.infer<typeof authenticationMethodSchema>
export type AuthenticatedActor = z.infer<typeof authenticatedActorSchema>
export type SessionRequestContext = z.infer<typeof sessionRequestContextSchema>
export type ApiKeyRequestContext = z.infer<typeof apiKeyRequestContextSchema>
export type PublicTokenRequestContext = z.infer<typeof publicTokenRequestContextSchema>
export type InternalRequestContext = z.infer<typeof internalRequestContextSchema>
export type AuthenticatedRequestContext = z.infer<typeof authenticatedRequestContextSchema>
export type AuthenticationErrorCode = z.infer<typeof authenticationErrorCodeSchema>
export type AuthenticationError = z.infer<typeof authenticationErrorSchema>
export type RequestAuthenticationResult = z.infer<typeof requestAuthenticationResultSchema>

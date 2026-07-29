import { describe, expect, it } from 'vitest'
import { authenticatedRequestContextSchema, requestAuthenticationResultSchema } from '../src/auth'
import { apiErrorEnvelopeSchema } from '../src/errors'
import { pageRequestSchema } from '../src/pagination'
import { traceContextSchema } from '../src/tracing'
import { w2TenantReadRouteContractSchema, w2TenantReadRouteContracts } from '../src/w2-tenant-read'

describe('API contract compatibility', () => {
  it('accepts omitted and nullable error details', () => {
    const withoutDetails = apiErrorEnvelopeSchema.parse({
      contractVersion: 1,
      error: {
        code: 'not_found',
        message: 'Missing',
        status: 404,
        retryable: false,
      },
    })
    const nullDetails = apiErrorEnvelopeSchema.parse({
      ...withoutDetails,
      error: { ...withoutDetails.error, details: null },
    })

    expect(withoutDetails.error.details).toBeUndefined()
    expect(nullDetails.error.details).toBeNull()
  })

  it('strips additive unknown fields while preserving known wire fields', () => {
    const parsed = traceContextSchema.parse({
      traceId: '1'.repeat(32),
      spanId: '2'.repeat(16),
      traceFlags: '01',
      correlationId: 'request-1',
      futureField: 'safe-to-ignore',
    })

    expect(parsed).not.toHaveProperty('futureField')
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(parsed)
  })

  it('applies a bounded default page size', () => {
    expect(pageRequestSchema.parse({})).toEqual({ limit: 50 })
    expect(() => pageRequestSchema.parse({ limit: 201 })).toThrow()
  })

  it('keeps all four authentication contexts wire-safe and rejects plaintext secrets', () => {
    const contexts = [
      {
        authContextVersion: 1,
        requestId: 'request-session',
        authenticationMethod: 'session',
        actor: { id: 'user-1', type: 'user', email: 'ada@example.com' },
        credentialId: 'session-1',
        activeOrganizationId: 'org-1',
        permissions: [],
      },
      {
        authContextVersion: 1,
        requestId: 'request-key',
        authenticationMethod: 'api-key',
        actor: { id: 'user-1', type: 'user' },
        credentialId: 'key-1',
        keyType: 'workspace',
        workspaceId: 'workspace-1',
        permissions: ['workspace:read'],
      },
      {
        authContextVersion: 1,
        requestId: 'request-public',
        authenticationMethod: 'public-token',
        actor: { id: 'public-share:share-1', type: 'public' },
        credentialId: 'share-1',
        workspaceId: 'workspace-1',
        organizationId: null,
        resourceType: 'file',
        resourceId: 'file-1',
        permissions: ['resource:read'],
      },
      {
        authContextVersion: 1,
        requestId: 'request-internal',
        authenticationMethod: 'internal',
        actor: { id: 'executor', type: 'service' },
        service: 'executor',
        scopes: ['workflow:execute'],
        permissions: ['workflow:execute'],
      },
    ]

    for (const context of contexts) {
      const parsed = authenticatedRequestContextSchema.parse(context)
      expect(JSON.parse(JSON.stringify(parsed))).toEqual(parsed)
      expect(parsed).not.toHaveProperty('token')
      expect(parsed).not.toHaveProperty('apiKey')
    }
  })

  it('defines stable authentication failure responses', () => {
    expect(
      requestAuthenticationResultSchema.parse({
        ok: false,
        error: {
          code: 'revoked_credentials',
          message: 'Invalid credentials',
          status: 401,
          retryable: false,
        },
      })
    ).toEqual({
      ok: false,
      error: {
        code: 'revoked_credentials',
        message: 'Invalid credentials',
        status: 401,
        retryable: false,
      },
    })
  })

  it('freezes the exact W2 tenant-read route set and test obligations', () => {
    expect(w2TenantReadRouteContracts).toHaveLength(22)
    expect(new Set(w2TenantReadRouteContracts.map((route) => route.inventoryId)).size).toBe(22)
    expect(w2TenantReadRouteContracts.filter((route) => route.backend === 'native')).toEqual([
      expect.objectContaining({ inventoryId: 'API-0294' }),
    ])
    for (const route of w2TenantReadRouteContracts) {
      expect(w2TenantReadRouteContractSchema.parse(route).requiredTests).toEqual([
        'contract',
        'auth',
        'differential',
        'integration',
      ])
    }
  })
})

import type { SessionRequestContext } from '@sim/api-contracts/auth'
import { getForkAvailabilityResponseV1Schema } from '@sim/api-contracts/workspace-forking'
import { createRequestAuthenticator } from '@sim/auth/request-context'
import type { AppConfigProfileReader } from '@sim/infra-appconfig'
import { describe, expect, it, vi } from 'vitest'
import { createApiApplication } from '@/bootstrap/application/create-api-application'
import { type ForkingRuntimeConfig, readForkingRuntimeConfig } from '@/config/forking-runtime'
import {
  createAppConfigForkRolloutReader,
  type PlatformAdminReader,
} from '@/infrastructure/appconfig/appconfig-fork-rollout-reader'
import { createRoutedTenantReadBackend } from '@/modules/tenant-read/application/create-routed-tenant-read-backend'
import { createTenantReadModule } from '@/modules/tenant-read/application/create-tenant-read-module'
import {
  createGetForkAvailabilityHandler,
  createGetForkAvailabilityUseCase,
  type ForkEntitlementReader,
  type ForkRolloutReader,
  type WorkspaceForkContextReader,
} from '@/modules/workspace-forking'

const sessionContext: SessionRequestContext = {
  authContextVersion: 1,
  requestId: 'request-1031',
  authenticationMethod: 'session',
  actor: {
    id: 'viewer-1',
    type: 'user',
    name: 'Viewer',
    email: 'viewer@example.com',
  },
  credentialId: 'session-1',
  activeOrganizationId: 'unrelated-organization',
  permissions: [],
}

const selfHostedRuntime: ForkingRuntimeConfig = {
  billingEnabled: false,
  forkingEnabled: true,
  accessControlEnabled: false,
  hosted: false,
  appConfig: { enabled: false },
}

const hostedRuntime: ForkingRuntimeConfig = {
  billingEnabled: true,
  forkingEnabled: false,
  accessControlEnabled: false,
  hosted: true,
  appConfig: {
    enabled: true,
    application: 'sim',
    environment: 'production',
    region: 'us-east-1',
  },
}

function contexts(organizationId: string | null = 'organization-1'): WorkspaceForkContextReader {
  return {
    findActive: vi.fn(async (workspaceId) =>
      workspaceId === 'workspace-missing' ? null : { organizationId }
    ),
  }
}

function entitlement(entitled = true): ForkEntitlementReader {
  return { isEntitled: vi.fn(async () => entitled) }
}

function rollout(enabled = true): ForkRolloutReader {
  return { isEnabled: vi.fn(async () => enabled) }
}

function handler(
  options: {
    contexts?: WorkspaceForkContextReader
    entitlement?: ForkEntitlementReader
    rollout?: ForkRolloutReader
    runtime?: ForkingRuntimeConfig
  } = {}
) {
  return createGetForkAvailabilityHandler(
    createGetForkAvailabilityUseCase({
      contexts: options.contexts ?? contexts(),
      entitlement: options.entitlement ?? entitlement(),
      rollout: options.rollout ?? rollout(),
      runtime: options.runtime ?? hostedRuntime,
    })
  )
}

function request(workspaceId = 'workspace-1') {
  return new Request(`http://api.test/api/workspaces/${workspaceId}/fork/availability`)
}

describe('native workspace fork availability', () => {
  it('preserves enterprise flag precedence and hosted AppConfig detection', () => {
    expect(
      readForkingRuntimeConfig({
        BILLING_ENABLED: 'false',
        ENTERPRISE_ENABLED: 'true',
      })
    ).toMatchObject({
      billingEnabled: false,
      forkingEnabled: true,
      appConfig: { enabled: false },
    })
    expect(
      readForkingRuntimeConfig({
        BILLING_ENABLED: 'false',
        ENTERPRISE_ENABLED: 'true',
        FORKING_ENABLED: 'false',
      })
    ).toMatchObject({ forkingEnabled: false })
    expect(
      readForkingRuntimeConfig({
        BILLING_ENABLED: 'true',
        ENTERPRISE_ENABLED: 'true',
        NEXT_PUBLIC_APP_URL: 'https://app.sim.ai',
        APPCONFIG_APPLICATION: 'sim',
        APPCONFIG_ENVIRONMENT: 'production',
      })
    ).toMatchObject({
      billingEnabled: true,
      forkingEnabled: false,
      hosted: true,
      appConfig: {
        enabled: true,
        application: 'sim',
        environment: 'production',
      },
    })
  })

  it('keeps self-host deployment gating independent from billing and AppConfig', async () => {
    const plan = entitlement(false)
    const featureRollout = rollout(false)
    const response = await handler({
      runtime: selfHostedRuntime,
      entitlement: plan,
      rollout: featureRollout,
    })({
      request: request(),
      authenticationContext: sessionContext,
      requestId: 'request-1031',
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ available: true })
    expect(plan.isEntitled).not.toHaveBeenCalled()
    expect(featureRollout.isEnabled).not.toHaveBeenCalled()

    const disabled = await handler({
      runtime: { ...selfHostedRuntime, forkingEnabled: false },
    })({
      request: request(),
      authenticationContext: sessionContext,
      requestId: 'request-1031',
    })
    expect(await disabled.json()).toEqual({ available: false })
  })

  it('requires an organization Enterprise entitlement when billing is enabled', async () => {
    const personal = await handler({ contexts: contexts(null) })({
      request: request(),
      authenticationContext: sessionContext,
      requestId: 'request-1031',
    })
    expect(await personal.json()).toEqual({ available: false })

    const unentitled = await handler({ entitlement: entitlement(false) })({
      request: request(),
      authenticationContext: sessionContext,
      requestId: 'request-1031',
    })
    expect(await unentitled.json()).toEqual({ available: false })

    const available = await handler()({
      request: request(),
      authenticationContext: sessionContext,
      requestId: 'request-1031',
    })
    const body = await available.json()
    expect(getForkAvailabilityResponseV1Schema.parse(body)).toEqual(body)
    expect(body).toEqual({ available: true })
  })

  it('collapses entitlement and rollout failures to a false verdict', async () => {
    const entitlementFailure = await handler({
      entitlement: {
        async isEntitled() {
          throw new Error('billing unavailable')
        },
      },
    })({
      request: request(),
      authenticationContext: sessionContext,
      requestId: 'request-1031',
    })
    expect(await entitlementFailure.json()).toEqual({ available: false })

    const rolloutFailure = await handler({
      rollout: {
        async isEnabled() {
          throw new Error('AppConfig unavailable')
        },
      },
    })({
      request: request(),
      authenticationContext: sessionContext,
      requestId: 'request-1031',
    })
    expect(await rolloutFailure.json()).toEqual({ available: false })
  })

  it('evaluates AppConfig global, user, org and lazy admin clauses', async () => {
    const read = vi.fn()
    const profiles: AppConfigProfileReader = {
      async read(_identifiers, parse) {
        read()
        return parse({
          'workspace-forking': {
            userIds: ['user-allowed'],
            orgIds: ['org-allowed'],
            adminEnabled: true,
          },
        })
      },
    }
    const isPlatformAdmin = vi.fn(async (userId: string) => userId === 'admin-1')
    const reader = createAppConfigForkRolloutReader({
      profiles,
      platformAdmins: { isPlatformAdmin },
      runtime: hostedRuntime,
    })

    await expect(
      reader.isEnabled({ userId: 'user-allowed', organizationId: 'org-other' })
    ).resolves.toBe(true)
    await expect(
      reader.isEnabled({ userId: 'user-other', organizationId: 'org-allowed' })
    ).resolves.toBe(true)
    expect(isPlatformAdmin).not.toHaveBeenCalled()
    await expect(
      reader.isEnabled({ userId: 'admin-1', organizationId: 'org-other' })
    ).resolves.toBe(true)
    await expect(
      reader.isEnabled({ userId: 'user-other', organizationId: 'org-other' })
    ).resolves.toBe(false)
    expect(isPlatformAdmin).toHaveBeenCalledTimes(2)
  })

  it('falls back to FORKING_ENABLED only when the AppConfig profile has no value', async () => {
    const platformAdmins: PlatformAdminReader = {
      isPlatformAdmin: vi.fn(async () => false),
    }
    const nullProfiles: AppConfigProfileReader = {
      async read() {
        return null
      },
    }
    const fallbackReader = createAppConfigForkRolloutReader({
      profiles: nullProfiles,
      platformAdmins,
      runtime: { ...hostedRuntime, forkingEnabled: true },
    })
    await expect(
      fallbackReader.isEnabled({ userId: 'viewer-1', organizationId: 'organization-1' })
    ).resolves.toBe(true)

    const emptyReader = createAppConfigForkRolloutReader({
      profiles: {
        async read(_identifiers, parse) {
          return parse({})
        },
      },
      platformAdmins,
      runtime: { ...hostedRuntime, forkingEnabled: true },
    })
    await expect(
      emptyReader.isEnabled({ userId: 'viewer-1', organizationId: 'organization-1' })
    ).resolves.toBe(false)
  })

  it('authenticates first and preserves donor workspace visibility semantics', async () => {
    const source = contexts()
    const direct = handler({ contexts: source })
    const unauthorized = await direct({
      request: request(),
      requestId: 'request-1031',
    })
    expect(unauthorized.status).toBe(401)
    expect(await unauthorized.json()).toEqual({ error: 'Unauthorized' })
    expect(source.findActive).not.toHaveBeenCalled()

    const missing = await direct({
      request: request('workspace-missing'),
      authenticationContext: sessionContext,
      requestId: 'request-1031',
    })
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({ error: 'Workspace not found' })

    // Donor checkWorkspaceAccess loads permission but does not inspect hasAccess.
    // The native seam therefore needs no access resolver and returns only a boolean.
    const existing = await direct({
      request: request('workspace-known-but-not-shared'),
      authenticationContext: sessionContext,
      requestId: 'request-1031',
    })
    expect(existing.status).toBe(200)
    expect(await existing.json()).toEqual({ available: true })
  })

  it('keeps active-workspace persistence failures as request-id 500s', async () => {
    const response = await handler({
      contexts: {
        async findActive() {
          throw new Error('database unavailable')
        },
      },
    })({
      request: request(),
      authenticationContext: sessionContext,
      requestId: 'request-1031',
    })

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: 'Internal server error',
      requestId: 'request-1031',
    })
  })

  it('executes through session authentication and API-1031 native routing', async () => {
    const authentication = createRequestAuthenticator({
      sessions: {
        async verify(headers) {
          return headers.get('cookie') === 'session=valid'
            ? {
                verified: true,
                credential: {
                  actor: sessionContext.actor,
                  sessionId: sessionContext.credentialId,
                  activeOrganizationId: sessionContext.activeOrganizationId,
                },
              }
            : { verified: false, reason: 'invalid' }
        },
      },
    })
    const application = createApiApplication({
      tenantRead: createTenantReadModule({
        authentication,
        backend: createRoutedTenantReadBackend({
          fallback: {
            async forward() {
              throw new Error('must not use legacy')
            },
          },
          nativeHandlers: { 'API-1031': handler() },
        }),
      }),
    })

    const response = await application.handle(
      new Request('http://api.test/api/workspaces/workspace-1/fork/availability', {
        headers: {
          cookie: 'session=valid',
          'x-request-id': 'request-1031',
        },
      })
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('x-sim-api-backend')).toBe('native')
    expect(response.headers.get('x-sim-api-inventory-id')).toBe('API-1031')
  })
})

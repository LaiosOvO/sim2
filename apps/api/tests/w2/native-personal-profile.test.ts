import type { SessionRequestContext } from '@sim/api-contracts/auth'
import { personalProfileResponseV1Schema } from '@sim/api-contracts/workspaces'
import type { RequestAccessResolver } from '@sim/auth/authorization'
import { createRequestAuthenticator } from '@sim/auth/request-context'
import type { PersonalIdentityProfile, PersonalIdentityProfileRepository } from '@sim/biz-identity'
import { createPersonalIdentityProfileService } from '@sim/biz-identity'
import { describe, expect, it, vi } from 'vitest'
import { createApiApplication } from '@/bootstrap/application/create-api-application'
import {
  createGetPersonalProfileHandler,
  createGetPersonalProfileUseCase,
} from '@/modules/identity'
import { createRoutedTenantReadBackend } from '@/modules/tenant-read/application/create-routed-tenant-read-backend'
import { createTenantReadModule } from '@/modules/tenant-read/application/create-tenant-read-module'

const sessionContext: SessionRequestContext = {
  authContextVersion: 1,
  requestId: 'request-1',
  authenticationMethod: 'session',
  actor: {
    id: 'user-1',
    type: 'user',
    name: 'Ada',
    email: 'ada@example.com',
  },
  credentialId: 'session-1',
  activeOrganizationId: 'organization-1',
  permissions: [],
}

const profile: PersonalIdentityProfile = {
  account: {
    id: 'user-1',
    name: 'Ada',
    email: 'ada@example.com',
    emailVerified: true,
    image: null,
    role: 'user',
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
  },
  workspace: {
    id: 'workspace-1',
    name: 'Platform',
    organizationId: 'organization-1',
  },
  identities: [
    {
      id: 'identity-1',
      providerKey: 'feishu',
      tenantKey: 'tenant-1',
      externalSubjectId: 'subject-1',
      identifiers: {
        providerUserId: 'provider-user-1',
        openId: 'open-1',
        unionId: 'union-1',
      },
      email: 'ada@example.com',
      loginName: 'ada',
      displayName: 'Ada',
      status: 'active',
      lastSyncedAt: new Date('2026-07-30T00:00:00.000Z'),
    },
  ],
}

const normalizedPolarisFixture = {
  account: {
    id: 'user-1',
    name: 'Ada',
    email: 'ada@example.com',
    emailVerified: true,
    image: null,
    role: 'user',
    createdAt: '2026-07-01T00:00:00.000Z',
  },
  workspace: {
    id: 'workspace-1',
    name: 'Platform',
    organizationId: 'organization-1',
  },
  identities: [
    {
      id: 'identity-1',
      providerKey: 'feishu',
      tenantKey: 'tenant-1',
      externalSubjectId: 'subject-1',
      providerUserId: 'provider-user-1',
      openId: 'open-1',
      unionId: 'union-1',
      email: 'ada@example.com',
      loginName: 'ada',
      displayName: 'Ada',
      status: 'active',
      lastSyncedAt: '2026-07-30T00:00:00.000Z',
    },
  ],
}

function accessResolver(
  permission: RequestAccessResolver['workspacePermission'] = async (_actorId, workspaceId) =>
    workspaceId === 'workspace-1' ? 'read' : null
): RequestAccessResolver {
  return {
    workspacePermission: vi.fn(permission),
    organizationRole: vi.fn(async () => null),
    workflow: vi.fn(async () => null),
  }
}

function repository(
  value: PersonalIdentityProfile | null = profile
): PersonalIdentityProfileRepository {
  return {
    findForUser: vi.fn(async () => value),
  }
}

function handler(
  profiles: PersonalIdentityProfileRepository = repository(),
  access: RequestAccessResolver = accessResolver()
) {
  return createGetPersonalProfileHandler(
    createGetPersonalProfileUseCase({
      access,
      profiles: createPersonalIdentityProfileService(profiles),
    })
  )
}

describe('native Polaris personal profile read', () => {
  it('matches the Polaris response while Biz sees provider-neutral identifiers', async () => {
    const profiles = repository()
    const response = await handler(profiles)({
      request: new Request('http://api.test/api/workspaces/workspace-1/personal-profile'),
      authenticationContext: sessionContext,
      requestId: 'request-1',
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual(normalizedPolarisFixture)
    expect(personalProfileResponseV1Schema.parse(body)).toEqual(normalizedPolarisFixture)
    expect(profiles.findForUser).toHaveBeenCalledWith('workspace-1', 'user-1')
  })

  it('preserves the Polaris typed 403 error and request identity', async () => {
    const profiles = repository()
    const response = await handler(
      profiles,
      accessResolver(async () => null)
    )({
      request: new Request('http://api.test/api/workspaces/workspace-2/personal-profile'),
      authenticationContext: sessionContext,
      requestId: 'request-denied',
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: 'Workspace access denied: workspace-2',
      requestId: 'request-denied',
    })
    expect(profiles.findForUser).not.toHaveBeenCalled()
  })

  it('preserves the Polaris generic 500 when the current account disappears', async () => {
    const response = await handler(repository(null))({
      request: new Request('http://api.test/api/workspaces/workspace-1/personal-profile'),
      authenticationContext: sessionContext,
      requestId: 'request-missing',
    })

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: 'Internal server error',
      requestId: 'request-missing',
    })
  })

  it('executes through session authentication and the native W2 route', async () => {
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
          nativeHandlers: { 'API-1060': handler() },
        }),
      }),
    })

    const response = await application.handle(
      new Request('http://api.test/api/workspaces/workspace-1/personal-profile', {
        headers: { cookie: 'session=valid', 'x-request-id': 'request-1' },
      })
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('x-sim-api-backend')).toBe('native')
    expect(response.headers.get('x-sim-api-inventory-id')).toBe('API-1060')
    expect(await response.json()).toEqual(normalizedPolarisFixture)
  })
})

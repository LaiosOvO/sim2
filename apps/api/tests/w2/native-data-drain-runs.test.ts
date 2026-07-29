import type { SessionRequestContext } from '@sim/api-contracts/auth'
import { listDataDrainRunsResponseV1Schema } from '@sim/api-contracts/data-drains'
import type { RequestAccessResolver } from '@sim/auth/authorization'
import { createRequestAuthenticator } from '@sim/auth/request-context'
import { describe, expect, it, vi } from 'vitest'
import { createApiApplication } from '@/bootstrap/application/create-api-application'
import {
  type DataDrainRuntimeConfig,
  readDataDrainRuntimeConfig,
} from '@/config/data-drain-runtime'
import {
  createListDataDrainRunsHandler,
  createListDataDrainRunsUseCase,
  type DataDrainEntitlementReader,
  type DataDrainRunReadRepository,
} from '@/modules/data-drains'
import { createRoutedTenantReadBackend } from '@/modules/tenant-read/application/create-routed-tenant-read-backend'
import { createTenantReadModule } from '@/modules/tenant-read/application/create-tenant-read-module'

const sessionContext: SessionRequestContext = {
  authContextVersion: 1,
  requestId: 'request-0209',
  authenticationMethod: 'session',
  actor: {
    id: 'admin-1',
    type: 'user',
    name: 'Admin',
    email: 'admin@example.com',
  },
  credentialId: 'session-1',
  activeOrganizationId: 'wrong-active-organization',
  permissions: [],
}

const hostedRuntime: DataDrainRuntimeConfig = {
  billingEnabled: true,
  dataDrainsEnabled: false,
  accessControlEnabled: false,
  hosted: true,
}

function access(role: string | null = 'admin'): RequestAccessResolver {
  return {
    workspacePermission: vi.fn(async () => null),
    organizationRole: vi.fn(async () => role),
    workflow: vi.fn(async () => null),
  }
}

function entitlement(entitled = true): DataDrainEntitlementReader {
  return { isEntitled: vi.fn(async () => entitled) }
}

function repository(
  records: Awaited<ReturnType<DataDrainRunReadRepository['listForOrganization']>> = [
    {
      id: 'run-new',
      drainId: 'drain-1',
      status: 'success',
      trigger: 'manual',
      startedAt: new Date('2026-07-30T02:00:00.000Z'),
      finishedAt: new Date('2026-07-30T02:01:00.000Z'),
      rowsExported: 12,
      bytesWritten: 345,
      cursorBefore: 'before',
      cursorAfter: 'after',
      error: null,
      locators: null,
    },
  ]
): DataDrainRunReadRepository {
  return { listForOrganization: vi.fn(async () => records) }
}

function handler(
  options: {
    access?: RequestAccessResolver
    entitlement?: DataDrainEntitlementReader
    repository?: DataDrainRunReadRepository
    runtime?: DataDrainRuntimeConfig
  } = {}
) {
  return createListDataDrainRunsHandler(
    createListDataDrainRunsUseCase({
      access: options.access ?? access(),
      entitlement: options.entitlement ?? entitlement(),
      repository: options.repository ?? repository(),
      runtime: options.runtime ?? hostedRuntime,
    })
  )
}

function request(query = '') {
  return new Request(
    `http://api.test/api/organizations/organization-1/data-drains/drain-1/runs${query}`
  )
}

describe('native data drain run read', () => {
  it('preserves self-host feature precedence without widening hosted billing access', () => {
    expect(
      readDataDrainRuntimeConfig({
        BILLING_ENABLED: 'false',
        ENTERPRISE_ENABLED: 'true',
      })
    ).toMatchObject({ billingEnabled: false, dataDrainsEnabled: true })
    expect(
      readDataDrainRuntimeConfig({
        BILLING_ENABLED: 'true',
        ENTERPRISE_ENABLED: 'true',
        NEXT_PUBLIC_APP_URL: 'https://app.sim.ai',
      })
    ).toEqual({
      billingEnabled: true,
      dataDrainsEnabled: false,
      accessControlEnabled: false,
      hosted: true,
    })
    expect(
      readDataDrainRuntimeConfig({
        BILLING_ENABLED: 'false',
        ENTERPRISE_ENABLED: 'true',
        DATA_DRAINS_ENABLED: 'false',
      })
    ).toMatchObject({ dataDrainsEnabled: false })
  })

  it('returns the bounded run projection with ISO timestamps and empty locators', async () => {
    const source = repository()
    const response = await handler({ repository: source })({
      request: request('?limit=10'),
      authenticationContext: sessionContext,
      requestId: 'request-0209',
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(listDataDrainRunsResponseV1Schema.parse(body)).toEqual(body)
    expect(body).toEqual({
      runs: [
        {
          id: 'run-new',
          drainId: 'drain-1',
          status: 'success',
          trigger: 'manual',
          startedAt: '2026-07-30T02:00:00.000Z',
          finishedAt: '2026-07-30T02:01:00.000Z',
          rowsExported: 12,
          bytesWritten: 345,
          cursorBefore: 'before',
          cursorAfter: 'after',
          error: null,
          locators: [],
        },
      ],
    })
    expect(source.listForOrganization).toHaveBeenCalledWith('organization-1', 'drain-1', 10)
  })

  it('uses the legacy default limit of 25', async () => {
    const source = repository([])
    const response = await handler({ repository: source })({
      request: request(),
      authenticationContext: sessionContext,
      requestId: 'request-0209',
    })

    expect(response.status).toBe(200)
    expect(source.listForOrganization).toHaveBeenCalledWith('organization-1', 'drain-1', 25)
  })

  it('authenticates and checks membership before query validation', async () => {
    const source = repository()
    const unauthorized = await handler({ repository: source })({
      request: request('?limit=0'),
      requestId: 'request-0209',
    })
    expect(unauthorized.status).toBe(401)
    expect(await unauthorized.json()).toEqual({ error: 'Unauthorized' })

    const nonMember = await handler({ access: access(null), repository: source })({
      request: request('?limit=0'),
      authenticationContext: sessionContext,
      requestId: 'request-0209',
    })
    expect(nonMember.status).toBe(403)
    expect(await nonMember.json()).toEqual({
      error: 'Forbidden - Not a member of this organization',
    })
    expect(source.listForOrganization).not.toHaveBeenCalled()
  })

  it('preserves deployment, enterprise, and organization-admin gate order', async () => {
    const disabledEntitlement = entitlement()
    const disabled = await handler({
      entitlement: disabledEntitlement,
      runtime: {
        billingEnabled: false,
        dataDrainsEnabled: false,
        accessControlEnabled: false,
        hosted: false,
      },
    })({
      request: request(),
      authenticationContext: sessionContext,
      requestId: 'request-0209',
    })
    expect(disabled.status).toBe(404)
    expect(await disabled.json()).toEqual({
      error: 'Data Drains are not enabled on this deployment',
    })
    expect(disabledEntitlement.isEntitled).not.toHaveBeenCalled()

    const unentitled = await handler({ entitlement: entitlement(false) })({
      request: request(),
      authenticationContext: sessionContext,
      requestId: 'request-0209',
    })
    expect(unentitled.status).toBe(403)
    expect(await unentitled.json()).toEqual({
      error: 'Data Drains are available on Enterprise plans only',
    })

    const member = await handler({ access: access('member') })({
      request: request(),
      authenticationContext: sessionContext,
      requestId: 'request-0209',
    })
    expect(member.status).toBe(403)
    expect(await member.json()).toEqual({
      error: 'Forbidden - Only organization owners and admins can view data drains',
    })
  })

  it('validates limit after authorization and conceals cross-organization drains', async () => {
    const invalid = await handler()({
      request: request('?limit=201'),
      authenticationContext: sessionContext,
      requestId: 'request-0209',
    })
    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toMatchObject({ error: 'Validation error' })

    const missing = await handler({ repository: repository(null) })({
      request: request(),
      authenticationContext: sessionContext,
      requestId: 'request-0209',
    })
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({ error: 'Data drain not found' })
  })

  it('preserves the generic request-id 500 envelope', async () => {
    const response = await handler({
      repository: {
        async listForOrganization() {
          throw new Error('database unavailable')
        },
      },
    })({
      request: request(),
      authenticationContext: sessionContext,
      requestId: 'request-0209',
    })

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: 'Internal server error',
      requestId: 'request-0209',
    })
  })

  it('executes through session authentication and API-0209 native routing', async () => {
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
          nativeHandlers: { 'API-0209': handler() },
        }),
      }),
    })

    const response = await application.handle(
      new Request('http://api.test/api/organizations/organization-1/data-drains/drain-1/runs', {
        headers: { cookie: 'session=valid', 'x-request-id': 'request-0209' },
      })
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('x-sim-api-backend')).toBe('native')
    expect(response.headers.get('x-sim-api-inventory-id')).toBe('API-0209')
  })
})

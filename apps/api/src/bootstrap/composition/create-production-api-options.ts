import type { RequestAccessResolver } from '@sim/auth/authorization'
import type { RequestAuthenticator } from '@sim/auth/request-context'
import type { PersonalIdentityProfileRepository } from '@sim/biz-identity'
import type { ApiApplicationOptions } from '@/bootstrap/application/create-api-application'
import { readDataDrainRuntimeConfig } from '@/config/data-drain-runtime'
import type { DataDrainEntitlementReader, DataDrainRunReadRepository } from '@/modules/data-drains'
import {
  createEnvironmentModule,
  type EnvironmentModule,
} from '@/modules/environment/application/create-environment-module'
import type { ExecutionAdmissionModule } from '@/modules/execution/application/create-execution-admission-module'
import type {
  InvitationReadRepository,
  WorkspaceInvitationReadRepository,
} from '@/modules/invitations'
import type {
  OrganizationAccessControlEntitlementReader,
  OrganizationInvitationHousekeeping,
  OrganizationRosterReadRepository,
  OrganizationWorkspaceReadRepository,
} from '@/modules/organizations'
import type { UserPermissionGroupReadRepository } from '@/modules/permission-groups'
import type { TenantReadModule } from '@/modules/tenant-read/application/create-tenant-read-module'
import type { NativeTenantReadHandler } from '@/modules/tenant-read/application/ports'
import type {
  WorkspaceHostContextReadRepository,
  WorkspaceMemberReadRepository,
} from '@/modules/workspaces'

function unavailableEnvironmentModule(): EnvironmentModule {
  return {
    async handle(request) {
      const { pathname } = new URL(request.url)
      if (pathname !== '/api/environment' || !['GET', 'POST'].includes(request.method)) {
        return undefined
      }
      return Response.json({ error: 'Service unavailable' }, { status: 503 })
    },
  }
}

async function createExecutionAdmission(): Promise<ExecutionAdmissionModule | undefined> {
  const baseUrl = process.env.WORKER_ADMISSION_URL?.trim()
  const internalToken = process.env.INTERNAL_EXECUTION_TOKEN?.trim()
  if (!baseUrl || !internalToken) return undefined
  const [{ createExecutionAdmissionModule }, { createHttpWorkerJobSubmitter }] = await Promise.all([
    import('@/modules/execution/application/create-execution-admission-module'),
    import('@/modules/execution/infrastructure/http-worker-job-submitter'),
  ])
  return createExecutionAdmissionModule({
    internalToken,
    submitter: createHttpWorkerJobSubmitter({ baseUrl, internalToken }),
  })
}

async function createAuthentication(
  secret: string | undefined,
  baseURL: string | undefined
): Promise<RequestAuthenticator> {
  if (!process.env.DATABASE_URL || !secret || !baseURL) {
    const { createRequestAuthenticator } = await import('@sim/auth/request-context')
    return createRequestAuthenticator({})
  }
  const [{ createSessionAuth }, { createProductionRequestAuthenticator }] = await Promise.all([
    import('@sim/auth/session'),
    import('@/middleware/authentication/composition/create-production-request-authenticator'),
  ])
  return createProductionRequestAuthenticator({
    sessionAuth: createSessionAuth({ secret, baseURL }),
    internalSecret:
      process.env.INTERNAL_JWT_SECRET?.trim() || process.env.INTERNAL_API_SECRET?.trim(),
  })
}

async function createTenantRead(
  authentication: RequestAuthenticator | undefined
): Promise<TenantReadModule> {
  const baseUrl = process.env.SIM_LEGACY_API_BASE_URL?.trim()
  const dataDrainRuntime = readDataDrainRuntimeConfig()
  const [
    { createTenantReadModule },
    { createRoutedTenantReadBackend, createUnavailableTenantReadBackend },
    { createHttpLegacyTenantReadBackend },
    { createGitHubStarsHandler },
    { createListDataDrainRunsHandler, createListDataDrainRunsUseCase },
    {
      createListMyInvitationsHandler,
      createListMyInvitationsUseCase,
      createListWorkspaceInvitationsHandler,
      createListWorkspaceInvitationsUseCase,
    },
    {
      createListOrganizationRosterHandler,
      createListOrganizationRosterUseCase,
      createListOrganizationWorkspacesHandler,
      createListOrganizationWorkspacesUseCase,
    },
    { createGetUserPermissionGroupHandler, createGetUserPermissionGroupUseCase },
    {
      createGetWorkspaceHostContextHandler,
      createGetWorkspaceHostContextUseCase,
      createListWorkspaceMembersHandler,
      createListWorkspaceMembersUseCase,
    },
    { createGetPersonalProfileHandler, createGetPersonalProfileUseCase },
    { createPersonalIdentityProfileService },
  ] = await Promise.all([
    import('@/modules/tenant-read/application/create-tenant-read-module'),
    import('@/modules/tenant-read/application/create-routed-tenant-read-backend'),
    import('@/modules/tenant-read/infrastructure/http-legacy-tenant-read-backend'),
    import('@/modules/tenant-read/infrastructure/native/github-stars-handler'),
    import('@/modules/data-drains'),
    import('@/modules/invitations'),
    import('@/modules/organizations'),
    import('@/modules/permission-groups'),
    import('@/modules/workspaces'),
    import('@/modules/identity'),
    import('@sim/biz-identity'),
  ])
  const fallback = baseUrl
    ? createHttpLegacyTenantReadBackend({ baseUrl })
    : createUnavailableTenantReadBackend()
  const githubToken = process.env.GITHUB_TOKEN?.trim()
  let invitationRepository: InvitationReadRepository & WorkspaceInvitationReadRepository = {
    async listPendingForEmail() {
      throw new Error('Invitation database is not configured')
    },
    async listForAccessibleWorkspaces() {
      throw new Error('Invitation database is not configured')
    },
  }
  let dataDrainRunRepository: DataDrainRunReadRepository = {
    async listForOrganization() {
      throw new Error('Data drain database is not configured')
    },
  }
  let dataDrainEntitlement: DataDrainEntitlementReader = {
    async isEntitled() {
      return false
    },
  }
  let workspaceMemberRepository: WorkspaceMemberReadRepository = {
    async listActiveMembers() {
      throw new Error('Workspace database is not configured')
    },
  }
  let workspaceHostContextRepository: WorkspaceHostContextReadRepository = {
    async readForViewer() {
      throw new Error('Workspace host-context database is not configured')
    },
  }
  let organizationWorkspaceRepository: OrganizationWorkspaceReadRepository = {
    async listByOrganization() {
      throw new Error('Organization database is not configured')
    },
  }
  let organizationRosterRepository: OrganizationRosterReadRepository = {
    async listMembers() {
      throw new Error('Organization database is not configured')
    },
    async loadAdminSnapshot() {
      throw new Error('Organization database is not configured')
    },
  }
  let organizationInvitationHousekeeping: OrganizationInvitationHousekeeping = {
    async expireStalePending() {
      throw new Error('Organization database is not configured')
    },
  }
  let organizationEntitlement: OrganizationAccessControlEntitlementReader = {
    async isEntitled() {
      return false
    },
  }
  let userPermissionGroupRepository: UserPermissionGroupReadRepository = {
    async findActiveWorkspace() {
      throw new Error('Permission group database is not configured')
    },
    async resolveForUser() {
      throw new Error('Permission group database is not configured')
    },
  }
  let personalIdentityRepository: PersonalIdentityProfileRepository = {
    async findForUser() {
      return null
    },
  }
  let accessResolver: RequestAccessResolver = {
    async workspacePermission() {
      return null
    },
    async organizationRole() {
      return null
    },
    async workflow() {
      return null
    },
  }
  if (process.env.DATABASE_URL) {
    const [
      { createDrizzleDataDrainEntitlementReader },
      { createDrizzleDataDrainRunReadRepository },
      { createDrizzleInvitationReadRepository },
      { createDrizzleWorkspaceMemberReadRepository },
      { createDrizzlePersonalIdentityProfileRepository },
      { createDrizzleOrganizationWorkspaceReadRepository },
      { createDrizzleOrganizationAccessControlEntitlementReader },
      { createDrizzleOrganizationRosterReadRepository },
      { createDrizzleOrganizationInvitationHousekeeping },
      { createDrizzleUserPermissionGroupReadRepository },
      { createDrizzleWorkspaceHostContextReadRepository },
      { createDrizzleAccessResolver },
      { readAccessControlRuntimeConfig },
    ] = await Promise.all([
      import('@/infrastructure/postgres/repositories/drizzle-data-drain-entitlement-reader'),
      import('@/infrastructure/postgres/repositories/drizzle-data-drain-run-read-repository'),
      import('@/infrastructure/postgres/repositories/drizzle-invitation-read-repository'),
      import('@/infrastructure/postgres/repositories/drizzle-workspace-member-read-repository'),
      import('@/infrastructure/postgres/repositories/drizzle-personal-identity-profile-repository'),
      import(
        '@/infrastructure/postgres/repositories/drizzle-organization-workspace-read-repository'
      ),
      import(
        '@/infrastructure/postgres/repositories/drizzle-organization-access-control-entitlement-reader'
      ),
      import('@/infrastructure/postgres/repositories/drizzle-organization-roster-read-repository'),
      import('@/infrastructure/postgres/repositories/drizzle-organization-invitation-housekeeping'),
      import(
        '@/infrastructure/postgres/repositories/drizzle-user-permission-group-read-repository'
      ),
      import(
        '@/infrastructure/postgres/repositories/drizzle-workspace-host-context-read-repository'
      ),
      import('@/middleware/authorization/infrastructure/drizzle-access-resolver'),
      import('@/config/enterprise-runtime'),
    ])
    dataDrainEntitlement = createDrizzleDataDrainEntitlementReader(dataDrainRuntime)
    dataDrainRunRepository = createDrizzleDataDrainRunReadRepository()
    invitationRepository = createDrizzleInvitationReadRepository()
    workspaceMemberRepository = createDrizzleWorkspaceMemberReadRepository()
    personalIdentityRepository = createDrizzlePersonalIdentityProfileRepository()
    organizationWorkspaceRepository = createDrizzleOrganizationWorkspaceReadRepository()
    organizationRosterRepository = createDrizzleOrganizationRosterReadRepository()
    organizationInvitationHousekeeping = createDrizzleOrganizationInvitationHousekeeping()
    userPermissionGroupRepository = createDrizzleUserPermissionGroupReadRepository()
    workspaceHostContextRepository = createDrizzleWorkspaceHostContextReadRepository()
    organizationEntitlement = createDrizzleOrganizationAccessControlEntitlementReader(
      readAccessControlRuntimeConfig()
    )
    accessResolver = createDrizzleAccessResolver()
  }
  const nativeHandlers: Record<
    | 'API-0137'
    | 'API-0209'
    | 'API-0235'
    | 'API-0241'
    | 'API-0243'
    | 'API-0294'
    | 'API-1041'
    | 'API-1057'
    | 'API-1060'
    | 'API-1124',
    NativeTenantReadHandler
  > = {
    'API-0137': createListMyInvitationsHandler(
      createListMyInvitationsUseCase(invitationRepository)
    ),
    'API-0209': createListDataDrainRunsHandler(
      createListDataDrainRunsUseCase({
        access: accessResolver,
        entitlement: dataDrainEntitlement,
        repository: dataDrainRunRepository,
        runtime: dataDrainRuntime,
      })
    ),
    'API-0235': createListOrganizationRosterHandler(
      createListOrganizationRosterUseCase({
        access: accessResolver,
        housekeeping: organizationInvitationHousekeeping,
        repository: organizationRosterRepository,
      })
    ),
    'API-0241': createListOrganizationWorkspacesHandler(
      createListOrganizationWorkspacesUseCase({
        access: accessResolver,
        entitlement: organizationEntitlement,
        repository: organizationWorkspaceRepository,
      })
    ),
    'API-0243': createGetUserPermissionGroupHandler(
      createGetUserPermissionGroupUseCase({
        access: accessResolver,
        entitlement: organizationEntitlement,
        repository: userPermissionGroupRepository,
      })
    ),
    'API-0294': createGitHubStarsHandler({
      ...(githubToken ? { token: githubToken } : {}),
    }),
    'API-1041': createGetWorkspaceHostContextHandler(
      createGetWorkspaceHostContextUseCase({
        access: accessResolver,
        repository: workspaceHostContextRepository,
      })
    ),
    'API-1057': createListWorkspaceMembersHandler(
      createListWorkspaceMembersUseCase({
        access: accessResolver,
        repository: workspaceMemberRepository,
      })
    ),
    'API-1060': createGetPersonalProfileHandler(
      createGetPersonalProfileUseCase({
        access: accessResolver,
        profiles: createPersonalIdentityProfileService(personalIdentityRepository),
      })
    ),
    'API-1124': createListWorkspaceInvitationsHandler(
      createListWorkspaceInvitationsUseCase(invitationRepository)
    ),
  }
  return createTenantReadModule({
    authentication,
    backend: createRoutedTenantReadBackend({
      fallback,
      nativeHandlers,
    }),
  })
}

function unconfiguredOptions(
  executionAdmission?: ExecutionAdmissionModule,
  tenantRead?: TenantReadModule
): ApiApplicationOptions {
  return {
    serviceName: 'sim-api',
    environment: unavailableEnvironmentModule(),
    executionAdmission,
    tenantRead,
    readinessChecks: {
      configuration: async () => false,
      database: async () => false,
    },
  }
}

export async function createProductionApiOptions(): Promise<ApiApplicationOptions> {
  const executionAdmission = await createExecutionAdmission()
  const secret = process.env.BETTER_AUTH_SECRET?.trim()
  const baseURL = process.env.BETTER_AUTH_URL?.trim() ?? process.env.NEXT_PUBLIC_APP_URL?.trim()
  const encryptionKey = process.env.ENCRYPTION_KEY?.trim()
  const authenticationConfigured = Boolean(process.env.DATABASE_URL && secret && baseURL)
  const environmentConfigured =
    authenticationConfigured && /^[0-9a-f]{64}$/i.test(encryptionKey ?? '')
  const tenantReadConfigured = Boolean(process.env.SIM_LEGACY_API_BASE_URL?.trim())
  const authentication =
    authenticationConfigured || tenantReadConfigured
      ? await createAuthentication(secret, baseURL)
      : undefined
  const tenantRead = await createTenantRead(authentication)
  if (!environmentConfigured) return unconfiguredOptions(executionAdmission, tenantRead)
  if (!authentication) throw new Error('Authentication composition is unavailable')

  const [
    { db },
    { sql },
    { createAesEnvironmentSecretCipher },
    { createAuditEnvironmentSink },
    { createDrizzleEnvironmentRepository },
    { createPersonalEnvironmentCredentialSync },
    { createPostHogEnvironmentEventSink },
  ] = await Promise.all([
    import('@sim/db'),
    import('drizzle-orm'),
    import('@/modules/environment/infrastructure/aes-environment-secret-cipher'),
    import('@/modules/environment/infrastructure/audit-environment-sink'),
    import('@/modules/environment/infrastructure/drizzle-environment-repository'),
    import('@/modules/environment/infrastructure/personal-environment-credential-sync'),
    import('@/modules/environment/infrastructure/posthog-environment-event-sink'),
  ])

  const environment = createEnvironmentModule({
    authentication,
    repository: createDrizzleEnvironmentRepository(),
    cipher: createAesEnvironmentSecretCipher(encryptionKey!),
    credentials: createPersonalEnvironmentCredentialSync(),
    audit: createAuditEnvironmentSink(),
    events: createPostHogEnvironmentEventSink(),
  })

  return {
    serviceName: 'sim-api',
    environment,
    executionAdmission,
    tenantRead,
    readinessChecks: {
      configuration: async () => true,
      database: async () => {
        await db.execute(sql`select 1`)
        return true
      },
    },
  }
}

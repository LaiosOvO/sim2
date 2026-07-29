export interface PersonalAccountProfile {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image: string | null
  role: string | null
  createdAt: Date
}

export interface PersonalWorkspaceProfile {
  id: string
  name: string
  organizationId: string | null
}

/**
 * Provider-neutral external identity. Provider-specific aliases are carried
 * as opaque identifier keys and interpreted only by infrastructure or legacy
 * transport adapters.
 */
export interface PersonalExternalIdentityProfile {
  id: string
  providerKey: string
  tenantKey: string
  externalSubjectId: string
  identifiers: Readonly<Record<string, string>>
  email: string | null
  loginName: string | null
  displayName: string
  status: string
  lastSyncedAt: Date
}

export interface PersonalIdentityProfile {
  account: PersonalAccountProfile
  workspace: PersonalWorkspaceProfile
  identities: readonly PersonalExternalIdentityProfile[]
}

export interface PersonalIdentityProfileRepository {
  findForUser(workspaceId: string, userId: string): Promise<PersonalIdentityProfile | null>
}

export class PersonalIdentityProfileNotFoundError extends Error {
  constructor() {
    super('Current account or active workspace not found')
    this.name = 'PersonalIdentityProfileNotFoundError'
  }
}

export interface PersonalIdentityProfileService {
  get(workspaceId: string, userId: string): Promise<PersonalIdentityProfile>
}

export function createPersonalIdentityProfileService(
  repository: PersonalIdentityProfileRepository
): PersonalIdentityProfileService {
  return {
    async get(workspaceId, userId) {
      const profile = await repository.findForUser(workspaceId, userId)
      if (!profile) throw new PersonalIdentityProfileNotFoundError()
      return profile
    },
  }
}

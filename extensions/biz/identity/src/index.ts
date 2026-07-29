export const IDENTITY_MODULE_ID = 'identity' as const

export {
  createPersonalIdentityProfileService,
  type PersonalAccountProfile,
  type PersonalExternalIdentityProfile,
  type PersonalIdentityProfile,
  PersonalIdentityProfileNotFoundError,
  type PersonalIdentityProfileRepository,
  type PersonalIdentityProfileService,
  type PersonalWorkspaceProfile,
} from './personal-profile'

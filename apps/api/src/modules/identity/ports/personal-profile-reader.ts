import type { PersonalIdentityProfile } from '@sim/biz-identity'

export interface PersonalProfileReader {
  get(workspaceId: string, userId: string): Promise<PersonalIdentityProfile>
}

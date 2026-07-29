import { z } from 'zod'

export const workspaceIdV1Schema = z.string().min(1)

export const workspaceMemberV1Schema = z.object({
  userId: z.string(),
  name: z.string(),
  image: z.string().nullable(),
})

export const listWorkspaceMembersResponseV1Schema = z.object({
  members: z.array(workspaceMemberV1Schema),
})

export const personalExternalIdentityV1Schema = z.object({
  id: z.string(),
  providerKey: z.string(),
  tenantKey: z.string(),
  externalSubjectId: z.string(),
  providerUserId: z.string().nullable(),
  openId: z.string().nullable(),
  unionId: z.string().nullable(),
  email: z.string().nullable(),
  loginName: z.string().nullable(),
  displayName: z.string(),
  status: z.string(),
  lastSyncedAt: z.string(),
})

export const personalAccountProfileV1Schema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  image: z.string().nullable(),
  role: z.string().nullable(),
  createdAt: z.string(),
})

export const personalWorkspaceProfileV1Schema = z.object({
  id: z.string(),
  name: z.string(),
  organizationId: z.string().nullable(),
})

export const personalProfileResponseV1Schema = z.object({
  account: personalAccountProfileV1Schema,
  workspace: personalWorkspaceProfileV1Schema,
  identities: z.array(personalExternalIdentityV1Schema),
})

export type WorkspaceMemberV1 = z.infer<typeof workspaceMemberV1Schema>
export type ListWorkspaceMembersResponseV1 = z.infer<typeof listWorkspaceMembersResponseV1Schema>
export type PersonalExternalIdentityV1 = z.infer<typeof personalExternalIdentityV1Schema>
export type PersonalAccountProfileV1 = z.infer<typeof personalAccountProfileV1Schema>
export type PersonalWorkspaceProfileV1 = z.infer<typeof personalWorkspaceProfileV1Schema>
export type PersonalProfileResponseV1 = z.infer<typeof personalProfileResponseV1Schema>

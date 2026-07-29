import { z } from 'zod'

export const organizationIdV1Schema = z.string().min(1)

export const organizationWorkspaceRefV1Schema = z.object({
  id: z.string().min(1),
  name: z.string(),
})

export const listOrganizationWorkspacesResponseV1Schema = z.object({
  workspaces: z.array(organizationWorkspaceRefV1Schema),
})

export const organizationRosterWorkspacePermissionV1Schema = z.enum(['admin', 'write', 'read'])

export const organizationRosterWorkspaceAccessV1Schema = z.object({
  workspaceId: z.string().min(1),
  workspaceName: z.string(),
  permission: organizationRosterWorkspacePermissionV1Schema,
})

export const organizationRosterMemberV1Schema = z.object({
  memberId: z.string().min(1),
  userId: z.string().min(1),
  role: z.enum(['owner', 'admin', 'member', 'external']),
  createdAt: z.string(),
  name: z.string(),
  email: z.string(),
  image: z.string().nullable(),
  workspaces: z.array(organizationRosterWorkspaceAccessV1Schema),
})

export const organizationRosterPendingInvitationV1Schema = z.object({
  id: z.string().min(1),
  email: z.string(),
  role: z.string(),
  kind: z.enum(['organization', 'workspace']),
  membershipIntent: z.enum(['internal', 'external']).optional(),
  createdAt: z.string(),
  expiresAt: z.string(),
  inviteeName: z.string().nullable(),
  inviteeImage: z.string().nullable(),
  workspaces: z.array(organizationRosterWorkspaceAccessV1Schema),
})

export const organizationRosterV1Schema = z.object({
  members: z.array(organizationRosterMemberV1Schema),
  pendingInvitations: z.array(organizationRosterPendingInvitationV1Schema),
  workspaces: z.array(organizationWorkspaceRefV1Schema),
})

export const getOrganizationRosterResponseV1Schema = z.object({
  success: z.literal(true),
  data: organizationRosterV1Schema,
})

export type OrganizationWorkspaceRefV1 = z.infer<typeof organizationWorkspaceRefV1Schema>
export type ListOrganizationWorkspacesResponseV1 = z.infer<
  typeof listOrganizationWorkspacesResponseV1Schema
>
export type OrganizationRosterWorkspacePermissionV1 = z.infer<
  typeof organizationRosterWorkspacePermissionV1Schema
>
export type OrganizationRosterWorkspaceAccessV1 = z.infer<
  typeof organizationRosterWorkspaceAccessV1Schema
>
export type OrganizationRosterMemberV1 = z.infer<typeof organizationRosterMemberV1Schema>
export type OrganizationRosterPendingInvitationV1 = z.infer<
  typeof organizationRosterPendingInvitationV1Schema
>
export type OrganizationRosterV1 = z.infer<typeof organizationRosterV1Schema>
export type GetOrganizationRosterResponseV1 = z.infer<typeof getOrganizationRosterResponseV1Schema>

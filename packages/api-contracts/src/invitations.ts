import { z } from 'zod'

export const workspacePermissionV1Schema = z.enum(['admin', 'write', 'read'])

export const invitationGrantV1Schema = z.object({
  workspaceId: z.string().min(1),
  workspaceName: z.string().nullable(),
  permission: workspacePermissionV1Schema,
})

export const invitationDetailsV1Schema = z.object({
  id: z.string().min(1),
  kind: z.enum(['organization', 'workspace']),
  email: z.string(),
  organizationId: z.string().nullable(),
  organizationName: z.string().nullable(),
  membershipIntent: z.enum(['internal', 'external']),
  role: z.string().min(1),
  status: z.string().min(1),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  inviterName: z.string().nullable(),
  inviterEmail: z.string().nullable(),
  grants: z.array(invitationGrantV1Schema),
})

export const listMyInvitationsResponseV1Schema = z.object({
  invitations: z.array(invitationDetailsV1Schema),
})

export type WorkspacePermissionV1 = z.infer<typeof workspacePermissionV1Schema>
export type InvitationGrantV1 = z.infer<typeof invitationGrantV1Schema>
export type InvitationDetailsV1 = z.infer<typeof invitationDetailsV1Schema>
export type ListMyInvitationsResponseV1 = z.infer<typeof listMyInvitationsResponseV1Schema>

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

export type WorkspaceMemberV1 = z.infer<typeof workspaceMemberV1Schema>
export type ListWorkspaceMembersResponseV1 = z.infer<typeof listWorkspaceMembersResponseV1Schema>

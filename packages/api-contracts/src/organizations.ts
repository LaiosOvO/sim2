import { z } from 'zod'

export const organizationIdV1Schema = z.string().min(1)

export const organizationWorkspaceRefV1Schema = z.object({
  id: z.string().min(1),
  name: z.string(),
})

export const listOrganizationWorkspacesResponseV1Schema = z.object({
  workspaces: z.array(organizationWorkspaceRefV1Schema),
})

export type OrganizationWorkspaceRefV1 = z.infer<typeof organizationWorkspaceRefV1Schema>
export type ListOrganizationWorkspacesResponseV1 = z.infer<
  typeof listOrganizationWorkspacesResponseV1Schema
>

import { z } from 'zod'

export const requestIdentitySchema = z.object({
  actorId: z.string().min(1),
  workspaceId: z.string().min(1).optional(),
  organizationId: z.string().min(1).optional(),
  permissions: z.array(z.string().min(1)).max(512),
  authenticationMethod: z.enum(['session', 'api-key', 'oauth', 'service']),
})

export type RequestIdentity = z.infer<typeof requestIdentitySchema>

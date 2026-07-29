import { z } from 'zod'

export const forkWorkspaceIdParamsV1Schema = z.object({
  id: z.string().min(1),
})

export const getForkAvailabilityResponseV1Schema = z.object({
  available: z.boolean(),
})

export type ForkWorkspaceIdParamsV1 = z.infer<typeof forkWorkspaceIdParamsV1Schema>
export type GetForkAvailabilityResponseV1 = z.infer<typeof getForkAvailabilityResponseV1Schema>

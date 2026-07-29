import { z } from 'zod'

export const environmentVariableSchema = z.object({
  key: z.string(),
  value: z.string(),
})

export const environmentVariablesSchema = z.record(z.string(), z.string())
export const personalEnvironmentDataSchema = z.record(z.string(), environmentVariableSchema)

export const savePersonalEnvironmentBodySchema = z.object({
  variables: environmentVariablesSchema,
})

export const personalEnvironmentResponseSchema = z.object({
  data: personalEnvironmentDataSchema,
})

export const environmentSaveResponseSchema = z.object({
  success: z.literal(true),
})

export const legacyRouteErrorSchema = z.object({
  error: z.string().min(1),
  details: z.array(z.unknown()).optional(),
})

export type EnvironmentVariable = z.infer<typeof environmentVariableSchema>
export type SavePersonalEnvironmentBody = z.infer<typeof savePersonalEnvironmentBodySchema>
export type PersonalEnvironmentResponse = z.infer<typeof personalEnvironmentResponseSchema>
export type EnvironmentSaveResponse = z.infer<typeof environmentSaveResponseSchema>
export type LegacyRouteError = z.infer<typeof legacyRouteErrorSchema>

import { z } from 'zod'
import { API_CONTRACTS_VERSION } from './version'

export const apiErrorSchema = z.object({
  code: z.string().min(1).max(128),
  message: z.string().min(1),
  status: z.number().int().min(400).max(599),
  retryable: z.boolean(),
  details: z.record(z.string(), z.unknown()).nullable().optional(),
})

export const apiErrorEnvelopeSchema = z.object({
  contractVersion: z.literal(API_CONTRACTS_VERSION),
  error: apiErrorSchema,
  traceId: z
    .string()
    .length(32)
    .regex(/^[0-9a-f]+$/)
    .optional(),
})

export type ApiError = z.infer<typeof apiErrorSchema>
export type ApiErrorEnvelope = z.infer<typeof apiErrorEnvelopeSchema>

import { z } from 'zod'
import { API_CONTRACTS_VERSION } from './version'

export const noInputSchema = z.object({}).strict()

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  timestamp: z.iso.datetime(),
})

export const statusTypeSchema = z.enum([
  'operational',
  'degraded',
  'outage',
  'maintenance',
  'error',
])

export const publicStatusResponseSchema = z.object({
  status: statusTypeSchema,
  message: z.string().min(1),
  url: z.url(),
  lastUpdated: z.iso.datetime(),
})

export const readinessResponseSchema = z.object({
  contractVersion: z.literal(API_CONTRACTS_VERSION),
  status: z.enum(['ready', 'not-ready']),
  checks: z.record(z.string(), z.boolean()),
})

export const apiVersionResponseSchema = z.object({
  contractVersion: z.literal(API_CONTRACTS_VERSION),
  service: z.string().min(1),
  apiContractsVersion: z.number().int().positive(),
  executionContractsVersion: z.number().int().positive(),
})

export type HealthResponse = z.infer<typeof healthResponseSchema>
export type StatusType = z.infer<typeof statusTypeSchema>
export type PublicStatusResponse = z.infer<typeof publicStatusResponseSchema>
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>
export type ApiVersionResponse = z.infer<typeof apiVersionResponseSchema>

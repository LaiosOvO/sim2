import { z } from 'zod'
import { EXECUTION_CONTRACTS_VERSION } from './version'

export const runtimeToolInvocationV1Schema = z.object({
  contractVersion: z.literal(EXECUTION_CONTRACTS_VERSION),
  toolId: z.string().min(1),
  credentialRef: z.string().min(1).optional(),
  params: z.record(z.string(), z.unknown()),
})

export const runtimeToolErrorCodeV1Schema = z.enum([
  'RUNTIME_JOB_PAYLOAD_INVALID',
  'RUNTIME_TOOL_NOT_FOUND',
  'RUNTIME_PROVIDER_NOT_FOUND',
  'RUNTIME_PROVIDER_EXPORT_INVALID',
  'RUNTIME_TOOL_INPUT_INVALID',
  'RUNTIME_CREDENTIAL_NOT_FOUND',
  'RUNTIME_PROVIDER_EXECUTION_FAILED',
])

export const runtimeToolExecutionErrorV1Schema = z.object({
  contractVersion: z.literal(EXECUTION_CONTRACTS_VERSION),
  code: runtimeToolErrorCodeV1Schema,
  message: z.string().min(1),
  requestedToolId: z.string().min(1),
  providerId: z.string().min(1).optional(),
})

const runtimeToolExecutionSuccessV1Schema = z.object({
  contractVersion: z.literal(EXECUTION_CONTRACTS_VERSION),
  ok: z.literal(true),
  requestedToolId: z.string().min(1),
  toolId: z.string().min(1),
  providerId: z.string().min(1),
  output: z.record(z.string(), z.unknown()),
})

const runtimeToolExecutionFailureV1Schema = z.object({
  contractVersion: z.literal(EXECUTION_CONTRACTS_VERSION),
  ok: z.literal(false),
  error: runtimeToolExecutionErrorV1Schema,
})

export const runtimeToolExecutionResultV1Schema = z.discriminatedUnion('ok', [
  runtimeToolExecutionSuccessV1Schema,
  runtimeToolExecutionFailureV1Schema,
])

export type RuntimeToolInvocationV1 = z.infer<typeof runtimeToolInvocationV1Schema>
export type RuntimeToolErrorCodeV1 = z.infer<typeof runtimeToolErrorCodeV1Schema>
export type RuntimeToolExecutionErrorV1 = z.infer<typeof runtimeToolExecutionErrorV1Schema>
export type RuntimeToolExecutionResultV1 = z.infer<typeof runtimeToolExecutionResultV1Schema>

import { z } from 'zod'
import { EXECUTION_CONTRACTS_VERSION } from './version'

const absoluteSandboxPathSchema = z.string().min(1).startsWith('/')

export const sandboxResourcePolicyV1Schema = z.object({
  contractVersion: z.literal(EXECUTION_CONTRACTS_VERSION),
  network: z.literal('deny'),
  filesystem: z.object({
    mode: z.literal('ephemeral'),
    readOnlyMounts: z.array(absoluteSandboxPathSchema).max(16).default([]),
    writableRoot: absoluteSandboxPathSchema.default('/tmp/job'),
  }),
  cpuTimeMs: z.number().int().min(10).max(5_000),
  memoryMiB: z.number().int().min(16).max(256),
  wallClockMs: z.number().int().min(10).max(30_000),
  maxInputBytes: z
    .number()
    .int()
    .min(1)
    .max(1024 * 1024),
  secrets: z
    .object({
      mode: z.literal('references-only'),
      credentialRefs: z.array(z.string().min(1)).max(32).default([]),
    })
    .strict(),
})

export const sandboxTestJobPayloadV1Schema = z
  .object({
    contractVersion: z.literal(EXECUTION_CONTRACTS_VERSION),
    type: z.literal('sandbox-test'),
    operation: z.enum(['echo', 'delay', 'transient-failure', 'fatal-failure']),
    input: z.unknown().optional(),
    delayMs: z.number().int().min(0).max(30_000).default(0),
    failuresBeforeSuccess: z.number().int().min(0).max(5).default(0),
    policy: sandboxResourcePolicyV1Schema,
  })
  .superRefine((value, context) => {
    if (value.operation === 'transient-failure' && value.failuresBeforeSuccess < 1) {
      context.addIssue({
        code: 'custom',
        path: ['failuresBeforeSuccess'],
        message: 'transient-failure requires at least one failure',
      })
    }
  })

export const executionJobAdmissionResponseV1Schema = z.object({
  contractVersion: z.literal(EXECUTION_CONTRACTS_VERSION),
  accepted: z.literal(true),
  jobId: z.string().min(1),
  executionId: z.string().min(1),
  duplicate: z.boolean(),
})

export const executionCancellationRequestV1Schema = z.object({
  contractVersion: z.literal(EXECUTION_CONTRACTS_VERSION),
  reason: z.string().min(1).max(500).optional(),
})

export const executionCancellationResponseV1Schema = z.object({
  contractVersion: z.literal(EXECUTION_CONTRACTS_VERSION),
  executionId: z.string().min(1),
  requested: z.literal(true),
  duplicate: z.boolean(),
})

export const sandboxExecutionResultV1Schema = z.object({
  contractVersion: z.literal(EXECUTION_CONTRACTS_VERSION),
  executionId: z.string().min(1),
  output: z.unknown(),
  usage: z.object({
    wallClockMs: z.number().int().nonnegative(),
    inputBytes: z.number().int().nonnegative(),
  }),
})

export const sandboxExecutionCommandV1Schema = z.object({
  contractVersion: z.literal(EXECUTION_CONTRACTS_VERSION),
  executionId: z.string().min(1),
  attempt: z.number().int().positive(),
  payload: sandboxTestJobPayloadV1Schema,
})

export const sandboxExecutionFailureV1Schema = z.object({
  contractVersion: z.literal(EXECUTION_CONTRACTS_VERSION),
  error: z.object({
    code: z.enum([
      'SANDBOX_INPUT_TOO_LARGE',
      'SANDBOX_POLICY_REJECTED',
      'SANDBOX_TRANSIENT_FAILURE',
      'SANDBOX_FATAL_FAILURE',
      'SANDBOX_CANCELLED',
      'SANDBOX_TIMEOUT',
    ]),
    message: z.string().min(1),
    retryable: z.boolean(),
  }),
})

export type SandboxResourcePolicyV1 = z.infer<typeof sandboxResourcePolicyV1Schema>
export type SandboxTestJobPayloadV1 = z.infer<typeof sandboxTestJobPayloadV1Schema>
export type ExecutionJobAdmissionResponseV1 = z.infer<typeof executionJobAdmissionResponseV1Schema>
export type ExecutionCancellationRequestV1 = z.infer<typeof executionCancellationRequestV1Schema>
export type ExecutionCancellationResponseV1 = z.infer<typeof executionCancellationResponseV1Schema>
export type SandboxExecutionResultV1 = z.infer<typeof sandboxExecutionResultV1Schema>
export type SandboxExecutionCommandV1 = z.infer<typeof sandboxExecutionCommandV1Schema>
export type SandboxExecutionFailureV1 = z.infer<typeof sandboxExecutionFailureV1Schema>

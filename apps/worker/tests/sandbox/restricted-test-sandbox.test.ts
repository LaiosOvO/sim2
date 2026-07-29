import { sandboxTestJobPayloadV1Schema } from '@sim/execution-contracts/job-control'
import { describe, expect, it } from 'vitest'
import { createRestrictedTestSandbox } from '@/sandbox/restricted-test/create-restricted-test-sandbox'

const policy = {
  contractVersion: 1 as const,
  network: 'deny' as const,
  filesystem: {
    mode: 'ephemeral' as const,
    readOnlyMounts: [],
    writableRoot: '/tmp/job',
  },
  cpuTimeMs: 100,
  memoryMiB: 32,
  wallClockMs: 1_000,
  maxInputBytes: 16,
  secrets: {
    mode: 'references-only' as const,
    credentialRefs: ['credential:test'],
  },
}

describe('restricted test Sandbox', () => {
  it('rejects plaintext secret fields at the contract boundary', () => {
    const result = sandboxTestJobPayloadV1Schema.safeParse({
      contractVersion: 1,
      type: 'sandbox-test',
      operation: 'echo',
      policy: {
        ...policy,
        secrets: {
          ...policy.secrets,
          values: { API_KEY: 'must-not-cross-the-boundary' },
        },
      },
    })

    expect(result.success).toBe(false)
  })

  it('enforces the serialized input byte limit', async () => {
    const sandbox = createRestrictedTestSandbox()
    await expect(
      sandbox.execute({
        executionId: 'execution-1',
        attempt: 1,
        payload: sandboxTestJobPayloadV1Schema.parse({
          contractVersion: 1,
          type: 'sandbox-test',
          operation: 'echo',
          input: { value: 'this input is over sixteen bytes' },
          policy,
        }),
        signal: new AbortController().signal,
      })
    ).rejects.toMatchObject({
      code: 'SANDBOX_INPUT_TOO_LARGE',
      retryable: false,
    })
  })
})

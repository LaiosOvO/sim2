import {
  EXECUTION_CONTRACTS_VERSION,
  executionObjectReadCommandV1Schema,
  executionObjectReadResultV1Schema,
  MAX_EXECUTION_OBJECT_BYTES,
} from '@sim/execution-contracts'
import { describe, expect, it } from 'vitest'

const command = {
  contractVersion: EXECUTION_CONTRACTS_VERSION,
  requestId: 'request-1',
  workspaceId: 'workspace-1',
  workflowId: 'workflow-1',
  executionId: 'execution-1',
  reference: {
    __simLargeValueRef: true as const,
    version: 1 as const,
    id: 'lv_abcdefghijkl',
    kind: 'object' as const,
    size: 4096,
    key: 'execution/workspace-1/workflow-1/execution-1/large-value-lv_abcdefghijkl.json',
    executionId: 'execution-1',
  },
}

describe('execution object read V1 contracts', () => {
  it('accepts a scoped command and all result states', () => {
    expect(executionObjectReadCommandV1Schema.parse(command)).toEqual(command)
    expect(
      executionObjectReadResultV1Schema.parse({
        contractVersion: EXECUTION_CONTRACTS_VERSION,
        requestId: 'request-1',
        status: 'found',
        data: { finalOutput: { answer: 42 } },
      })
    ).toMatchObject({ status: 'found' })
    expect(
      executionObjectReadResultV1Schema.parse({
        contractVersion: EXECUTION_CONTRACTS_VERSION,
        requestId: 'request-1',
        status: 'missing',
      })
    ).toMatchObject({ status: 'missing' })
    expect(
      executionObjectReadResultV1Schema.parse({
        contractVersion: EXECUTION_CONTRACTS_VERSION,
        requestId: 'request-1',
        status: 'unavailable',
        error: 'storage unavailable',
      })
    ).toMatchObject({ status: 'unavailable' })
  })

  it('rejects cross-scope keys, version drift, and oversized objects', () => {
    expect(
      executionObjectReadCommandV1Schema.safeParse({
        ...command,
        reference: { ...command.reference, key: command.reference.key.replace('workspace-1', 'x') },
      }).success
    ).toBe(false)
    expect(
      executionObjectReadCommandV1Schema.safeParse({
        ...command,
        reference: {
          ...command.reference,
          key: command.reference.key.replace('/large-value-', '/nested/large-value-'),
        },
      }).success
    ).toBe(false)
    expect(
      executionObjectReadCommandV1Schema.safeParse({ ...command, contractVersion: 2 }).success
    ).toBe(false)
    expect(
      executionObjectReadCommandV1Schema.safeParse({
        ...command,
        reference: { ...command.reference, size: MAX_EXECUTION_OBJECT_BYTES + 1 },
      }).success
    ).toBe(false)
  })
})

import { EXECUTION_CONTRACTS_VERSION } from '@sim/execution-contracts'
import {
  executionObjectReadCommandV1Schema,
  executionObjectReferenceV1Schema,
} from '@sim/execution-contracts/execution-object-read'
import type {
  ExecutionObjectStore,
  ExecutionPayloadMaterializer,
} from '@/modules/execution/control'

function workflowIdFromStorageKey(key: string): string | null {
  const parts = key.split('/')
  return parts.length >= 5 && parts[0] === 'execution' ? (parts[2] ?? null) : null
}

export function createObjectStoreExecutionPayloadMaterializer(
  objects: ExecutionObjectStore
): ExecutionPayloadMaterializer {
  return {
    async materialize(record) {
      const { traceStoreRef, ...markers } = record.executionData
      const reference = executionObjectReferenceV1Schema.safeParse(traceStoreRef)
      if (!reference.success) return record.executionData
      const ref = reference.data
      const workflowId = record.workflowId ?? workflowIdFromStorageKey(ref.key)
      if (!workflowId) return markers
      const scoped = executionObjectReadCommandV1Schema.safeParse({
        contractVersion: EXECUTION_CONTRACTS_VERSION,
        requestId: `materialize:${record.executionId}`,
        reference: ref,
        workspaceId: record.workspaceId,
        workflowId,
        executionId: record.executionId,
      })
      if (!scoped.success) return markers
      const materialized = await objects.readJson({
        reference: ref,
        workspaceId: record.workspaceId,
        workflowId,
        executionId: record.executionId,
      })
      return materialized && typeof materialized === 'object' && !Array.isArray(materialized)
        ? { ...(materialized as Record<string, unknown>), ...markers }
        : markers
    },
  }
}

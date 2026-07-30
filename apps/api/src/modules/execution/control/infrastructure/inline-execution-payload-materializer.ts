import type { ExecutionPayloadMaterializer } from '@/modules/execution/control'

/**
 * Materializes inline rows without importing the legacy execution store.
 * Externalized rows degrade to their inline markers until the dedicated object
 * store adapter is enabled; status polling never invokes this adapter.
 */
export function createInlineExecutionPayloadMaterializer(): ExecutionPayloadMaterializer {
  return {
    async materialize(record) {
      const { traceStoreRef: _pointer, ...inline } = record.executionData
      return inline
    },
  }
}

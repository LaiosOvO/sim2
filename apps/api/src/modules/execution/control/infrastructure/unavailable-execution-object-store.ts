import {
  type ExecutionObjectStore,
  ExecutionPayloadUnavailableError,
} from '@/modules/execution/control'

export function createUnavailableExecutionObjectStore(reason: string): ExecutionObjectStore {
  return {
    async readJson() {
      throw new ExecutionPayloadUnavailableError(reason)
    },
  }
}

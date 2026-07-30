import type { InternalExecutionObjectReader } from '@/lib/api/server/internal-execution-object-read'

const materializationProbe = '__simInternalExecutionObjectReadProbe'

export function createSimTraceExecutionObjectReader(): InternalExecutionObjectReader {
  return {
    async read(command) {
      const { materializeExecutionData } = await import('@/lib/logs/execution/trace-store')
      const materialized = await materializeExecutionData(
        {
          traceStoreRef: command.reference,
          [materializationProbe]: true,
        },
        {
          workspaceId: command.workspaceId,
          workflowId: command.workflowId,
          executionId: command.executionId,
        }
      )
      const { [materializationProbe]: _probe, ...data } = materialized
      return Object.keys(data).length > 0 ? data : null
    },
  }
}

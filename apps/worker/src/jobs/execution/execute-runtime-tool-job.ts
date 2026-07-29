import { EXECUTION_CONTRACTS_VERSION, type ExecutionJobV1 } from '@sim/execution-contracts'
import {
  type RuntimeToolExecutionResultV1,
  runtimeToolInvocationV1Schema,
} from '@sim/execution-contracts/runtime-tools'
import type { RuntimeToolRegistry } from '@/runtime/registry/types'

export async function executeRuntimeToolJob(
  job: ExecutionJobV1,
  registry: RuntimeToolRegistry,
  signal?: AbortSignal
): Promise<RuntimeToolExecutionResultV1> {
  const invocation = runtimeToolInvocationV1Schema.safeParse(job.payload)
  if (!invocation.success) {
    return {
      contractVersion: EXECUTION_CONTRACTS_VERSION,
      ok: false,
      error: {
        contractVersion: EXECUTION_CONTRACTS_VERSION,
        code: 'RUNTIME_JOB_PAYLOAD_INVALID',
        message: 'Execution job payload is not a valid runtime tool invocation',
        requestedToolId:
          typeof job.payload.toolId === 'string' && job.payload.toolId
            ? job.payload.toolId
            : 'unknown',
      },
    }
  }

  return registry.execute({
    toolId: invocation.data.toolId,
    params: invocation.data.params,
    context: {
      jobId: job.jobId,
      executionId: job.executionId,
      workspaceId: job.workspaceId,
      workflowId: job.workflowId,
      credentialRef: invocation.data.credentialRef,
      signal,
    },
  })
}

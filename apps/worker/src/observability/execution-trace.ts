import type { TraceContext } from '@sim/api-contracts/tracing'
import { executionJobV1Schema } from '@sim/execution-contracts/jobs'

export function executionTraceFromJob(candidate: unknown): TraceContext {
  return executionJobV1Schema.parse(candidate).trace
}

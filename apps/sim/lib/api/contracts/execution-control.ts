import {
  jobStatusParamsV1Schema,
  jobStatusResponseV1Schema,
  workflowExecutionStatusParamsV1Schema,
  workflowExecutionStatusQueryV1Schema,
  workflowExecutionStatusResponseV1Schema,
} from '@sim/api-contracts/execution-control'
import { defineRouteContract } from '@/lib/api/contracts/types'

export const getJobStatusContract = defineRouteContract({
  method: 'GET',
  path: '/api/jobs/[jobId]',
  params: jobStatusParamsV1Schema,
  response: { mode: 'json', schema: jobStatusResponseV1Schema },
})

export const getWorkflowExecutionStatusContract = defineRouteContract({
  method: 'GET',
  path: '/api/workflows/[id]/executions/[executionId]',
  params: workflowExecutionStatusParamsV1Schema,
  query: workflowExecutionStatusQueryV1Schema,
  response: { mode: 'json', schema: workflowExecutionStatusResponseV1Schema },
})

export type {
  JobStatusResponseV1,
  WorkflowExecutionStatusQueryV1,
  WorkflowExecutionStatusResponseV1,
} from '@sim/api-contracts/execution-control'

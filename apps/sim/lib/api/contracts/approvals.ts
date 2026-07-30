import {
  approvalDefinitionParamsV1Schema,
  approvalParamsV1Schema,
  createApprovalDefinitionBodyV1Schema,
  createApprovalDefinitionResponseV1Schema,
  createApprovalDefinitionVersionBodyV1Schema,
  createApprovalDefinitionVersionResponseV1Schema,
  decideApprovalBodyV1Schema,
  decideApprovalResponseV1Schema,
  listApprovalAuditLogsQueryV1Schema,
  listApprovalAuditLogsResponseV1Schema,
  listApprovalDefinitionsQueryV1Schema,
  listApprovalDefinitionsResponseV1Schema,
  listApprovalsQueryV1Schema,
  listApprovalsResponseV1Schema,
  publishApprovalDefinitionVersionParamsV1Schema,
  retryApprovalResumeBodyV1Schema,
  retryApprovalResumeResponseV1Schema,
  startApprovalBodyV1Schema,
  startApprovalResponseV1Schema,
} from '@sim/api-contracts/approvals'
import { defineRouteContract } from '@/lib/api/contracts/types'

export const listApprovalsContract = defineRouteContract({
  method: 'GET',
  path: '/api/approvals',
  query: listApprovalsQueryV1Schema,
  response: { mode: 'json', schema: listApprovalsResponseV1Schema },
})
export const listApprovalAuditLogsContract = defineRouteContract({
  method: 'GET',
  path: '/api/approvals/audit-logs',
  query: listApprovalAuditLogsQueryV1Schema,
  response: { mode: 'json', schema: listApprovalAuditLogsResponseV1Schema },
})
export const listApprovalDefinitionsContract = defineRouteContract({
  method: 'GET',
  path: '/api/approvals/definitions',
  query: listApprovalDefinitionsQueryV1Schema,
  response: { mode: 'json', schema: listApprovalDefinitionsResponseV1Schema },
})
export const createApprovalDefinitionContract = defineRouteContract({
  method: 'POST',
  path: '/api/approvals/definitions',
  body: createApprovalDefinitionBodyV1Schema,
  response: {
    mode: 'json',
    schema: createApprovalDefinitionResponseV1Schema,
    status: [201, 400, 401, 403, 409],
  },
})
export const createApprovalDefinitionVersionContract = defineRouteContract({
  method: 'POST',
  path: '/api/approvals/definitions/[definitionId]/versions',
  params: approvalDefinitionParamsV1Schema,
  body: createApprovalDefinitionVersionBodyV1Schema,
  response: {
    mode: 'json',
    schema: createApprovalDefinitionVersionResponseV1Schema,
    status: [201, 400, 401, 403, 404, 409],
  },
})
export const publishApprovalDefinitionVersionContract = defineRouteContract({
  method: 'POST',
  path: '/api/approvals/definitions/[definitionId]/versions/[versionId]/publish',
  params: publishApprovalDefinitionVersionParamsV1Schema,
  response: {
    mode: 'json',
    schema: createApprovalDefinitionVersionResponseV1Schema,
    status: [200, 400, 401, 403, 404, 409],
  },
})
export const startApprovalContract = defineRouteContract({
  method: 'POST',
  path: '/api/approvals/start',
  body: startApprovalBodyV1Schema,
  response: {
    mode: 'json',
    schema: startApprovalResponseV1Schema,
    status: [201, 400, 401, 403, 404, 409],
  },
})
export const decideApprovalContract = defineRouteContract({
  method: 'POST',
  path: '/api/approvals/[approvalId]/decisions',
  params: approvalParamsV1Schema,
  body: decideApprovalBodyV1Schema,
  response: {
    mode: 'json',
    schema: decideApprovalResponseV1Schema,
    status: [200, 400, 401, 403, 404, 409],
  },
})
export const retryApprovalResumeContract = defineRouteContract({
  method: 'POST',
  path: '/api/approvals/[approvalId]/resume',
  params: approvalParamsV1Schema,
  body: retryApprovalResumeBodyV1Schema,
  response: {
    mode: 'json',
    schema: retryApprovalResumeResponseV1Schema,
    status: [200, 400, 401, 403, 404, 409],
  },
})

export type {
  ApprovalApiEventV1,
  ApprovalAuditLogV1,
  ApprovalDefinitionSpecV1,
  ApprovalDefinitionV1,
  ApprovalDefinitionVersionV1,
  ApprovalV1,
  CreateApprovalDefinitionBodyV1,
  DecideApprovalBodyV1,
  StartApprovalBodyV1,
} from '@sim/api-contracts/approvals'

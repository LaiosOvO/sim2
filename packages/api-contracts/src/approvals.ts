import { z } from 'zod'

export const approvalStatusV1Schema = z.enum([
  'pending',
  'approved',
  'rejected',
  'returned',
  'withdrawn',
  'escalated',
  'cancelled',
  'expired',
])

export const approvalModeV1Schema = z.enum(['any', 'all'])
export const approvalResumeStatusV1Schema = z.enum(['pending', 'starting', 'started', 'failed'])
export const approvalDecisionActionV1Schema = z.enum([
  'approve',
  'reject',
  'return',
  'transfer',
  'add_sign',
  'comment',
  'timeout',
  'escalate',
])

export const approvalCandidateV1Schema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('user'), userId: z.string().min(1).max(256) }).strict(),
  z.object({ kind: z.literal('role'), roleCode: z.string().min(1).max(100) }).strict(),
])

export const approvalDefinitionNodeV1Schema = z.discriminatedUnion('type', [
  z
    .object({
      id: z.string().min(1).max(100),
      type: z.literal('start'),
      name: z.string().min(1).max(120).optional(),
    })
    .strict(),
  z
    .object({
      id: z.string().min(1).max(100),
      type: z.literal('approval'),
      name: z.string().min(1).max(120),
      mode: approvalModeV1Schema.default('any'),
      candidates: z.array(approvalCandidateV1Schema).min(1).max(100),
      isDecision: z.boolean().default(false),
      timeout: z
        .object({
          afterMinutes: z.number().int().min(1).max(525_600),
          action: z.enum(['remind', 'approve', 'reject', 'escalate']),
          escalationCandidates: z.array(approvalCandidateV1Schema).max(100).optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
  z
    .object({
      id: z.string().min(1).max(100),
      type: z.literal('end'),
      name: z.string().min(1).max(120).optional(),
    })
    .strict(),
])

export const approvalDefinitionEdgeV1Schema = z
  .object({
    from: z.string().min(1).max(100),
    to: z.string().min(1).max(100),
    condition: z.enum(['approve', 'reject', 'return']).optional(),
  })
  .strict()

export const approvalDefinitionSpecV1Schema = z
  .object({
    nodes: z.array(approvalDefinitionNodeV1Schema).min(3).max(200),
    edges: z.array(approvalDefinitionEdgeV1Schema).min(2).max(500),
  })
  .strict()

export const approvalTaskV1Schema = z
  .object({
    id: z.string(),
    stepInstanceId: z.string().nullable(),
    channel: z.string(),
    receiveIdType: z.string(),
    reviewerExternalId: z.string(),
    reviewerUserId: z.string().nullable(),
    reviewerRoleCode: z.string().nullable(),
    canAct: z.boolean(),
    status: z.string(),
    messageId: z.string().nullable(),
    decidedByExternalId: z.string().nullable(),
    decidedAt: z.string().nullable(),
  })
  .strict()

export const approvalDecisionV1Schema = z
  .object({
    id: z.string(),
    taskId: z.string(),
    action: approvalDecisionActionV1Schema,
    actorExternalId: z.string().nullable(),
    comment: z.string().nullable(),
    payload: z.record(z.string(), z.unknown()),
    createdAt: z.string(),
  })
  .strict()

export const approvalV1Schema = z
  .object({
    id: z.string(),
    workspaceId: z.string(),
    workflowId: z.string(),
    definitionVersionId: z.string().nullable(),
    executionId: z.string(),
    contextId: z.string(),
    businessType: z.string(),
    businessId: z.string().nullable(),
    title: z.string(),
    content: z.string(),
    mode: approvalModeV1Schema,
    status: approvalStatusV1Schema,
    resumeStatus: approvalResumeStatusV1Schema,
    resumeExecutionId: z.string().nullable(),
    resumeError: z.string().nullable(),
    state: z.record(z.string(), z.unknown()),
    versionNo: z.number().int(),
    requestedBy: z.string().nullable(),
    decidedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    tasks: z.array(approvalTaskV1Schema),
    decisions: z.array(approvalDecisionV1Schema),
  })
  .strict()

export const listApprovalsQueryV1Schema = z
  .object({
    workspaceId: z.string().min(1),
    executionId: z.string().min(1).optional(),
    status: approvalStatusV1Schema.optional(),
    view: z.enum(['pending_for_me', 'requested_by_me', 'all']).default('all'),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict()
export const listApprovalsResponseV1Schema = z
  .object({ approvals: z.array(approvalV1Schema) })
  .strict()

export const approvalDefinitionVersionV1Schema = z
  .object({
    id: z.string(),
    definitionId: z.string(),
    version: z.number().int(),
    status: z.enum(['draft', 'published', 'retired']),
    spec: approvalDefinitionSpecV1Schema,
    publishedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict()
export const approvalDefinitionV1Schema = z
  .object({
    id: z.string(),
    workspaceId: z.string(),
    code: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    enabled: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
    versions: z.array(approvalDefinitionVersionV1Schema),
  })
  .strict()

export const listApprovalDefinitionsQueryV1Schema = z
  .object({ workspaceId: z.string().min(1) })
  .strict()
export const listApprovalDefinitionsResponseV1Schema = z
  .object({ definitions: z.array(approvalDefinitionV1Schema) })
  .strict()
export const createApprovalDefinitionBodyV1Schema = z
  .object({
    workspaceId: z.string().min(1),
    code: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-z][a-z0-9_]*$/),
    name: z.string().min(1).max(120),
    description: z.string().max(500).optional(),
    spec: approvalDefinitionSpecV1Schema,
  })
  .strict()
export const createApprovalDefinitionResponseV1Schema = z
  .object({ definition: approvalDefinitionV1Schema })
  .strict()
export const approvalDefinitionParamsV1Schema = z
  .object({ definitionId: z.string().min(1) })
  .strict()
export const createApprovalDefinitionVersionBodyV1Schema = z
  .object({ spec: approvalDefinitionSpecV1Schema })
  .strict()
export const createApprovalDefinitionVersionResponseV1Schema = z
  .object({ version: approvalDefinitionVersionV1Schema })
  .strict()
export const publishApprovalDefinitionVersionParamsV1Schema = z
  .object({ definitionId: z.string().min(1), versionId: z.string().min(1) })
  .strict()

export const startApprovalBodyV1Schema = z
  .object({
    workspaceId: z.string().min(1),
    workflowId: z.string().min(1),
    executionId: z.string().min(1),
    contextId: z.string().min(1),
    definitionVersionId: z.string().min(1),
    title: z.string().min(1).max(200),
    content: z.string().min(1).max(100_000),
    businessType: z.string().min(1).max(100).default('workflow'),
    businessId: z.string().max(200).optional(),
    projectId: z.string().max(200).optional(),
    projectName: z.string().max(200).optional(),
    reviewerUserIds: z.array(z.string().min(1).max(256)).max(100).optional(),
  })
  .strict()
export const startApprovalResponseV1Schema = z.object({ approval: approvalV1Schema }).strict()

export const approvalParamsV1Schema = z.object({ approvalId: z.string().min(1) }).strict()
export const decideApprovalBodyV1Schema = z
  .object({
    taskId: z.string().min(1),
    action: z.enum(['approve', 'reject', 'return', 'transfer', 'add_sign', 'comment']),
    comment: z.string().max(10_000).optional(),
    targetUserId: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (['reject', 'return'].includes(value.action) && !value.comment?.trim()) {
      context.addIssue({
        code: 'custom',
        path: ['comment'],
        message: 'reject and return decisions require a comment',
      })
    }
    if (['transfer', 'add_sign'].includes(value.action) && !value.targetUserId) {
      context.addIssue({
        code: 'custom',
        path: ['targetUserId'],
        message: 'transfer and add_sign decisions require targetUserId',
      })
    }
  })
export const decideApprovalResponseV1Schema = z
  .object({
    status: z.enum(['pending', 'terminal', 'resuming', 'queued', 'already_decided']),
    approvalStatus: approvalStatusV1Schema,
    approvalId: z.string(),
    resumeExecutionId: z.string().optional(),
  })
  .strict()
export const retryApprovalResumeBodyV1Schema = z
  .object({ reason: z.string().trim().min(1).max(1_000).optional() })
  .strict()
export const retryApprovalResumeResponseV1Schema = z
  .object({
    status: z.enum(['resuming', 'queued']),
    approvalId: z.string(),
    resumeExecutionId: z.string(),
    recoveredStalledClaim: z.boolean(),
  })
  .strict()

export const approvalApiEventCategoryV1Schema = z.enum([
  'card_sent',
  'approved',
  'rejected',
  'returned',
  'write',
])
export const listApprovalAuditLogsQueryV1Schema = z
  .object({
    workspaceId: z.string().min(1),
    status: approvalStatusV1Schema.optional(),
    workflowId: z.string().min(1).optional(),
    projectId: z.string().min(1).optional(),
    eventCategory: approvalApiEventCategoryV1Schema.optional(),
    search: z.string().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100),
  })
  .strict()
export const approvalAuditLogV1Schema = approvalV1Schema.extend({
  workflowName: z.string().nullable(),
  projectId: z.string().nullable(),
  projectName: z.string().nullable(),
  approvalFlowName: z.string().nullable(),
  approvalFlowVersion: z.number().int().nullable(),
  requestedByUser: z
    .object({ id: z.string(), name: z.string(), email: z.string() })
    .strict()
    .nullable(),
  actorDirectory: z.array(
    z.object({ id: z.string(), name: z.string(), email: z.string() }).strict()
  ),
})
export const approvalApiEventV1Schema = z
  .object({
    id: z.string(),
    category: approvalApiEventCategoryV1Schema,
    action: z.string(),
    actorId: z.string().nullable(),
    actorName: z.string().nullable(),
    actorEmail: z.string().nullable(),
    resourceId: z.string().nullable(),
    resourceName: z.string().nullable(),
    description: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown()),
    createdAt: z.string(),
  })
  .strict()
export const listApprovalAuditLogsResponseV1Schema = z
  .object({
    logs: z.array(approvalAuditLogV1Schema),
    apiEvents: z.array(approvalApiEventV1Schema),
  })
  .strict()

export const approvalRouteV1Schema = z
  .object({
    inventoryId: z.enum([
      'API-0002',
      'API-0003',
      'API-0004',
      'API-0005',
      'API-0006',
      'API-0007',
      'API-0009',
      'API-0010',
    ]),
    methods: z.array(z.enum(['GET', 'POST'])).min(1),
    pathTemplate: z.string().startsWith('/api/approvals'),
    authMode: z.enum(['session', 'hybrid']),
  })
  .strict()

export const approvalRoutesV1 = [
  {
    inventoryId: 'API-0002',
    methods: ['POST'],
    pathTemplate: '/api/approvals/[approvalId]/decisions',
    authMode: 'session',
  },
  {
    inventoryId: 'API-0003',
    methods: ['POST'],
    pathTemplate: '/api/approvals/[approvalId]/resume',
    authMode: 'session',
  },
  {
    inventoryId: 'API-0004',
    methods: ['GET'],
    pathTemplate: '/api/approvals/audit-logs',
    authMode: 'session',
  },
  {
    inventoryId: 'API-0005',
    methods: ['POST'],
    pathTemplate: '/api/approvals/definitions/[definitionId]/versions/[versionId]/publish',
    authMode: 'session',
  },
  {
    inventoryId: 'API-0006',
    methods: ['POST'],
    pathTemplate: '/api/approvals/definitions/[definitionId]/versions',
    authMode: 'session',
  },
  {
    inventoryId: 'API-0007',
    methods: ['GET', 'POST'],
    pathTemplate: '/api/approvals/definitions',
    authMode: 'session',
  },
  {
    inventoryId: 'API-0009',
    methods: ['GET'],
    pathTemplate: '/api/approvals',
    authMode: 'hybrid',
  },
  {
    inventoryId: 'API-0010',
    methods: ['POST'],
    pathTemplate: '/api/approvals/start',
    authMode: 'hybrid',
  },
] as const

export type ApprovalStatusV1 = z.infer<typeof approvalStatusV1Schema>
export type ApprovalModeV1 = z.infer<typeof approvalModeV1Schema>
export type ApprovalDecisionActionV1 = z.infer<typeof approvalDecisionActionV1Schema>
export type ApprovalCandidateV1 = z.infer<typeof approvalCandidateV1Schema>
export type ApprovalDefinitionNodeV1 = z.infer<typeof approvalDefinitionNodeV1Schema>
export type ApprovalDefinitionSpecV1 = z.infer<typeof approvalDefinitionSpecV1Schema>
export type ApprovalV1 = z.infer<typeof approvalV1Schema>
export type ApprovalDefinitionV1 = z.infer<typeof approvalDefinitionV1Schema>
export type ApprovalDefinitionVersionV1 = z.infer<typeof approvalDefinitionVersionV1Schema>
export type ApprovalAuditLogV1 = z.infer<typeof approvalAuditLogV1Schema>
export type ApprovalApiEventV1 = z.infer<typeof approvalApiEventV1Schema>
export type ListApprovalsQueryV1 = z.input<typeof listApprovalsQueryV1Schema>
export type ParsedListApprovalsQueryV1 = z.output<typeof listApprovalsQueryV1Schema>
export type CreateApprovalDefinitionBodyV1 = z.input<typeof createApprovalDefinitionBodyV1Schema>
export type ParsedCreateApprovalDefinitionBodyV1 = z.output<
  typeof createApprovalDefinitionBodyV1Schema
>
export type StartApprovalBodyV1 = z.input<typeof startApprovalBodyV1Schema>
export type ParsedStartApprovalBodyV1 = z.output<typeof startApprovalBodyV1Schema>
export type DecideApprovalBodyV1 = z.input<typeof decideApprovalBodyV1Schema>
export type ParsedDecideApprovalBodyV1 = z.output<typeof decideApprovalBodyV1Schema>
export type ApprovalRouteV1 = z.infer<typeof approvalRouteV1Schema>

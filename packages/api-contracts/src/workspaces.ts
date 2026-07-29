import { z } from 'zod'

export const workspaceIdV1Schema = z.string().min(1)

export const workspaceMemberV1Schema = z.object({
  userId: z.string(),
  name: z.string(),
  image: z.string().nullable(),
})

export const listWorkspaceMembersResponseV1Schema = z.object({
  members: z.array(workspaceMemberV1Schema),
})

export const workspaceModeV1Schema = z.enum(['personal', 'organization', 'grandfathered_shared'])

export const workspacePermissionLevelV1Schema = z.enum(['admin', 'write', 'read'])

export const workspaceOwnerBillingV1Schema = z.object({
  plan: z.string(),
  status: z.string().nullable(),
  isPaid: z.boolean(),
  isPro: z.boolean(),
  isTeam: z.boolean(),
  isEnterprise: z.boolean(),
  isOrgScoped: z.boolean(),
  organizationId: z.string().nullable(),
  billingInterval: z.enum(['month', 'year']),
  billingBlocked: z.boolean(),
  billingBlockedReason: z.enum(['payment_failed', 'dispute']).nullable(),
})

export const workspaceHostContextV1Schema = z.object({
  workspace: z.object({
    id: workspaceIdV1Schema,
    name: z.string().min(1),
    workspaceMode: workspaceModeV1Schema,
    billedAccountUserId: z.string().min(1),
  }),
  hostOrganizationId: z.string().min(1).nullable(),
  ownerBilling: workspaceOwnerBillingV1Schema,
  viewer: z.object({
    permission: workspacePermissionLevelV1Schema,
    isHostOrganizationMember: z.boolean(),
    isHostOrganizationAdmin: z.boolean(),
  }),
})

export const workspaceExecutionMetricsQueryV1Schema = z.object({
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  segments: z.coerce.number().min(1).max(200).default(72),
  workflowIds: z.string().optional(),
  folderIds: z.string().optional(),
  triggers: z.string().optional(),
  level: z.string().optional(),
  allTime: z.enum(['true', 'false']).optional().default('false'),
})

export const workspaceExecutionMetricSegmentV1Schema = z.object({
  timestamp: z.string(),
  totalExecutions: z.number().int().nonnegative(),
  successfulExecutions: z.number().int().nonnegative(),
  avgDurationMs: z.number().nonnegative(),
  p50Ms: z.number().nonnegative(),
  p90Ms: z.number().nonnegative(),
  p99Ms: z.number().nonnegative(),
})

export const workspaceExecutionMetricsWorkflowV1Schema = z.object({
  workflowId: z.string(),
  workflowName: z.string(),
  segments: z.array(workspaceExecutionMetricSegmentV1Schema),
})

export const workspaceExecutionMetricsResponseV1Schema = z.object({
  workflows: z.array(workspaceExecutionMetricsWorkflowV1Schema),
  startTime: z.string(),
  endTime: z.string(),
  segmentMs: z.number().nonnegative(),
})

export const personalExternalIdentityV1Schema = z.object({
  id: z.string(),
  providerKey: z.string(),
  tenantKey: z.string(),
  externalSubjectId: z.string(),
  providerUserId: z.string().nullable(),
  openId: z.string().nullable(),
  unionId: z.string().nullable(),
  email: z.string().nullable(),
  loginName: z.string().nullable(),
  displayName: z.string(),
  status: z.string(),
  lastSyncedAt: z.string(),
})

export const personalAccountProfileV1Schema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  image: z.string().nullable(),
  role: z.string().nullable(),
  createdAt: z.string(),
})

export const personalWorkspaceProfileV1Schema = z.object({
  id: z.string(),
  name: z.string(),
  organizationId: z.string().nullable(),
})

export const personalProfileResponseV1Schema = z.object({
  account: personalAccountProfileV1Schema,
  workspace: personalWorkspaceProfileV1Schema,
  identities: z.array(personalExternalIdentityV1Schema),
})

export type WorkspaceMemberV1 = z.infer<typeof workspaceMemberV1Schema>
export type ListWorkspaceMembersResponseV1 = z.infer<typeof listWorkspaceMembersResponseV1Schema>
export type WorkspaceModeV1 = z.infer<typeof workspaceModeV1Schema>
export type WorkspacePermissionLevelV1 = z.infer<typeof workspacePermissionLevelV1Schema>
export type WorkspaceOwnerBillingV1 = z.infer<typeof workspaceOwnerBillingV1Schema>
export type WorkspaceHostContextV1 = z.infer<typeof workspaceHostContextV1Schema>
export type WorkspaceExecutionMetricsQueryV1 = z.infer<
  typeof workspaceExecutionMetricsQueryV1Schema
>
export type WorkspaceExecutionMetricSegmentV1 = z.infer<
  typeof workspaceExecutionMetricSegmentV1Schema
>
export type WorkspaceExecutionMetricsWorkflowV1 = z.infer<
  typeof workspaceExecutionMetricsWorkflowV1Schema
>
export type WorkspaceExecutionMetricsResponseV1 = z.infer<
  typeof workspaceExecutionMetricsResponseV1Schema
>
export type PersonalExternalIdentityV1 = z.infer<typeof personalExternalIdentityV1Schema>
export type PersonalAccountProfileV1 = z.infer<typeof personalAccountProfileV1Schema>
export type PersonalWorkspaceProfileV1 = z.infer<typeof personalWorkspaceProfileV1Schema>
export type PersonalProfileResponseV1 = z.infer<typeof personalProfileResponseV1Schema>

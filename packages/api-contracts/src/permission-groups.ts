import { z } from 'zod'

export const permissionGroupShareAuthTypeV1Schema = z.enum(['public', 'password', 'email', 'sso'])

export const permissionGroupConfigV1Schema = z.object({
  allowedIntegrations: z.array(z.string()).nullable(),
  allowedModelProviders: z.array(z.string()).nullable(),
  deniedModels: z.array(z.string()),
  deniedTools: z.array(z.string()),
  hideTraceSpans: z.boolean(),
  hideKnowledgeBaseTab: z.boolean(),
  hideTablesTab: z.boolean(),
  hideCopilot: z.boolean(),
  hideIntegrationsTab: z.boolean(),
  hideSecretsTab: z.boolean(),
  hideApiKeysTab: z.boolean(),
  hideInboxTab: z.boolean(),
  hideFilesTab: z.boolean(),
  disableMcpTools: z.boolean(),
  disableCustomTools: z.boolean(),
  disableSkills: z.boolean(),
  disableInvitations: z.boolean(),
  disablePublicApi: z.boolean(),
  disablePublicFileSharing: z.boolean(),
  allowedFileShareAuthTypes: z.array(permissionGroupShareAuthTypeV1Schema).nullable(),
  hideDeployApi: z.boolean(),
  hideDeployMcp: z.boolean(),
  hideDeployChatbot: z.boolean(),
  allowedChatDeployAuthTypes: z.array(permissionGroupShareAuthTypeV1Schema).nullable(),
})

export const defaultPermissionGroupConfigV1 = {
  allowedIntegrations: null,
  allowedModelProviders: null,
  deniedModels: [],
  deniedTools: [],
  hideTraceSpans: false,
  hideKnowledgeBaseTab: false,
  hideTablesTab: false,
  hideCopilot: false,
  hideIntegrationsTab: false,
  hideSecretsTab: false,
  hideApiKeysTab: false,
  hideInboxTab: false,
  hideFilesTab: false,
  disableMcpTools: false,
  disableCustomTools: false,
  disableSkills: false,
  disableInvitations: false,
  disablePublicApi: false,
  disablePublicFileSharing: false,
  allowedFileShareAuthTypes: null,
  hideDeployApi: false,
  hideDeployMcp: false,
  hideDeployChatbot: false,
  allowedChatDeployAuthTypes: null,
} satisfies PermissionGroupConfigV1

export const userPermissionGroupWorkspaceIdV1Schema = z.string().min(1)

export const getUserPermissionGroupResponseV1Schema = z.object({
  permissionGroupId: z.string().nullable(),
  groupName: z.string().nullable(),
  config: permissionGroupConfigV1Schema.nullable(),
  entitled: z.boolean(),
  organizationId: z.string().nullable(),
  isOrgAdmin: z.boolean(),
})

export type PermissionGroupShareAuthTypeV1 = z.infer<typeof permissionGroupShareAuthTypeV1Schema>
export type PermissionGroupConfigV1 = z.infer<typeof permissionGroupConfigV1Schema>
export type GetUserPermissionGroupResponseV1 = z.infer<
  typeof getUserPermissionGroupResponseV1Schema
>

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function shareAuthTypes(value: unknown): PermissionGroupShareAuthTypeV1[] | null {
  if (!Array.isArray(value)) return null
  return value.filter(
    (item): item is PermissionGroupShareAuthTypeV1 =>
      permissionGroupShareAuthTypeV1Schema.safeParse(item).success
  )
}

export function normalizePermissionGroupConfigV1(input: unknown): PermissionGroupConfigV1 {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ...defaultPermissionGroupConfigV1 }
  }
  const value = input as Record<string, unknown>
  const booleanOrFalse = (key: string): boolean =>
    typeof value[key] === 'boolean' ? value[key] : false

  return permissionGroupConfigV1Schema.parse({
    allowedIntegrations: Array.isArray(value.allowedIntegrations)
      ? value.allowedIntegrations
      : null,
    allowedModelProviders: Array.isArray(value.allowedModelProviders)
      ? value.allowedModelProviders
      : null,
    deniedModels: stringArray(value.deniedModels),
    deniedTools: stringArray(value.deniedTools),
    hideTraceSpans: booleanOrFalse('hideTraceSpans'),
    hideKnowledgeBaseTab: booleanOrFalse('hideKnowledgeBaseTab'),
    hideTablesTab: booleanOrFalse('hideTablesTab'),
    hideCopilot: booleanOrFalse('hideCopilot'),
    hideIntegrationsTab: booleanOrFalse('hideIntegrationsTab'),
    hideSecretsTab: booleanOrFalse('hideSecretsTab'),
    hideApiKeysTab: booleanOrFalse('hideApiKeysTab'),
    hideInboxTab: booleanOrFalse('hideInboxTab'),
    hideFilesTab: booleanOrFalse('hideFilesTab'),
    disableMcpTools: booleanOrFalse('disableMcpTools'),
    disableCustomTools: booleanOrFalse('disableCustomTools'),
    disableSkills: booleanOrFalse('disableSkills'),
    disableInvitations: booleanOrFalse('disableInvitations'),
    disablePublicApi: booleanOrFalse('disablePublicApi'),
    disablePublicFileSharing: booleanOrFalse('disablePublicFileSharing'),
    allowedFileShareAuthTypes: shareAuthTypes(value.allowedFileShareAuthTypes),
    hideDeployApi: booleanOrFalse('hideDeployApi'),
    hideDeployMcp: booleanOrFalse('hideDeployMcp'),
    hideDeployChatbot: booleanOrFalse('hideDeployChatbot'),
    allowedChatDeployAuthTypes: shareAuthTypes(value.allowedChatDeployAuthTypes),
  })
}

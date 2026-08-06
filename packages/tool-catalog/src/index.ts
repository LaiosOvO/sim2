import { z } from 'zod'

export const TOOL_CATALOG_VERSION = 1 as const

export const toolInputDescriptorV1Schema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['string', 'number', 'boolean', 'json', 'file', 'credential']),
  required: z.boolean(),
  description: z.string().optional(),
})

export const toolCatalogItemV1Schema = z.object({
  catalogVersion: z.literal(TOOL_CATALOG_VERSION),
  id: z.string().min(1),
  legacyIds: z.array(z.string().min(1)),
  provider: z.string().min(1),
  version: z.string().min(1),
  display: z.object({
    name: z.string().min(1),
    description: z.string(),
    category: z.string().min(1),
    icon: z.string().optional(),
    bgColor: z.string().optional(),
  }),
  capabilities: z.array(z.string().min(1)),
  inputs: z.array(toolInputDescriptorV1Schema),
})

export const toolCatalogPageV1Schema = z.object({
  catalogVersion: z.literal(TOOL_CATALOG_VERSION),
  catalogHash: z.string().min(1),
  items: z.array(toolCatalogItemV1Schema),
  nextCursor: z.string().min(1).nullable(),
})

export const toolCatalogSummaryItemV1Schema = toolCatalogItemV1Schema
  .pick({
    id: true,
    legacyIds: true,
    provider: true,
    version: true,
    display: true,
  })
  .extend({
    visibility: z.object({
      hideFromToolbar: z.boolean(),
      preview: z.boolean(),
      editorCreatable: z.boolean(),
    }),
  })

export const toolCatalogSummaryDocumentV1Schema = z.object({
  catalogVersion: z.literal(TOOL_CATALOG_VERSION),
  catalogHash: z.string().min(1),
  items: z.array(toolCatalogSummaryItemV1Schema),
})

export const agentToolOptionV1Schema = z.object({
  type: z.string().min(1),
  title: z.string().min(1),
  capabilities: z.array(z.string().min(1)),
})

export const agentToolOptionsDocumentV1Schema = z.object({
  catalogVersion: z.literal(TOOL_CATALOG_VERSION),
  catalogHash: z.string().min(1),
  items: z.array(agentToolOptionV1Schema),
})

export type EditorTemplateJsonValue =
  | string
  | number
  | boolean
  | null
  | EditorTemplateJsonValue[]
  | { [key: string]: EditorTemplateJsonValue }

export const editorTemplateJsonValueSchema: z.ZodType<EditorTemplateJsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(editorTemplateJsonValueSchema),
    z.record(z.string(), editorTemplateJsonValueSchema),
  ])
)

export const editorBlockTemplateFieldV1Schema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  type: z.string().min(1),
  required: z.boolean(),
  mode: z.enum(['basic', 'advanced']),
  placeholder: z.string().optional(),
  canonicalParamId: z.string().optional(),
  columns: z.array(z.string()).optional(),
  selectorKey: z.string().optional(),
  selectorAllowSearch: z.boolean().optional(),
  serviceId: z.string().optional(),
  mimeType: z.string().optional(),
  credentialKind: z.enum(['oauth', 'service-account', 'any']).optional(),
  dependsOn: editorTemplateJsonValueSchema.optional(),
  condition: editorTemplateJsonValueSchema.optional(),
  options: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
      })
    )
    .optional(),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
  multiple: z.boolean().optional(),
  readOnly: z.boolean().optional(),
  initialValue: editorTemplateJsonValueSchema,
})

export const editorBlockTemplateV1Schema = z.object({
  catalogVersion: z.literal(TOOL_CATALOG_VERSION),
  type: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(['action', 'trigger']),
  singleInstance: z.boolean(),
  fields: z.array(editorBlockTemplateFieldV1Schema),
  outputs: z.record(z.string(), editorTemplateJsonValueSchema),
  canonicalModes: z.record(z.string(), z.enum(['basic', 'advanced'])),
})

export const editorBlockTemplateDocumentV1Schema = z.object({
  catalogVersion: z.literal(TOOL_CATALOG_VERSION),
  catalogHash: z.string().min(1),
  templates: z.array(editorBlockTemplateV1Schema),
})

export type ToolInputDescriptorV1 = z.infer<typeof toolInputDescriptorV1Schema>
export type ToolCatalogItemV1 = z.infer<typeof toolCatalogItemV1Schema>
export type ToolCatalogPageV1 = z.infer<typeof toolCatalogPageV1Schema>
export type ToolCatalogSummaryItemV1 = z.infer<typeof toolCatalogSummaryItemV1Schema>
export type ToolCatalogSummaryDocumentV1 = z.infer<typeof toolCatalogSummaryDocumentV1Schema>
export type AgentToolOptionV1 = z.infer<typeof agentToolOptionV1Schema>
export type AgentToolOptionsDocumentV1 = z.infer<typeof agentToolOptionsDocumentV1Schema>
export type EditorBlockTemplateFieldV1 = z.infer<typeof editorBlockTemplateFieldV1Schema>
export type EditorBlockTemplateV1 = z.infer<typeof editorBlockTemplateV1Schema>
export type EditorBlockTemplateDocumentV1 = z.infer<typeof editorBlockTemplateDocumentV1Schema>

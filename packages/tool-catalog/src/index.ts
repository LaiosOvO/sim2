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

export type ToolInputDescriptorV1 = z.infer<typeof toolInputDescriptorV1Schema>
export type ToolCatalogItemV1 = z.infer<typeof toolCatalogItemV1Schema>
export type ToolCatalogPageV1 = z.infer<typeof toolCatalogPageV1Schema>

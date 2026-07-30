import { z } from 'zod'

export const customBlockInputV1Schema = z
  .object({
    id: z.string().optional(),
    name: z.string(),
    type: z.string(),
    description: z.string().optional(),
    placeholder: z.string().optional(),
    required: z.boolean().optional(),
  })
  .strict()

export const customBlockInputOverrideV1Schema = z.object({
  id: z.string().min(1),
  placeholder: z.string().max(200).optional(),
  required: z.boolean().optional(),
})

export const customBlockOutputV1Schema = z.object({
  blockId: z.string().min(1),
  path: z.string().min(1),
  name: z.string().min(1).max(60),
})

const reservedOutputNames = new Set(['success', 'error', 'cost'])

export const customBlockOutputWriteV1Schema = customBlockOutputV1Schema.refine(
  (output) => !reservedOutputNames.has(output.name.trim().toLowerCase()),
  { message: 'Output name is reserved (success, error, cost)', path: ['name'] }
)

export const customBlockV1Schema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    workflowId: z.string(),
    workflowName: z.string(),
    workspaceId: z.string().nullable(),
    workspaceName: z.string().nullable(),
    type: z.string(),
    name: z.string(),
    description: z.string(),
    iconUrl: z.string().nullable(),
    enabled: z.boolean(),
    inputFields: z.array(customBlockInputV1Schema),
    exposedOutputs: z.array(customBlockOutputV1Schema),
  })
  .strict()

export const customBlockIdParamsV1Schema = z.object({ id: z.string().min(1) }).strict()
export const listCustomBlocksQueryV1Schema = z.object({ workspaceId: z.string().min(1) }).strict()

export const customBlockIconUrlV1Schema = z
  .string()
  .min(1)
  .max(2048)
  .refine(
    (value) => value.startsWith('https://') || value.startsWith('/api/files/serve/'),
    'iconUrl must be an https URL or an internal /api/files/serve/ path'
  )

export const publishCustomBlockBodyV1Schema = z.object({
  workspaceId: z.string().min(1),
  workflowId: z.string().min(1),
  name: z.string().min(1, 'Name is required').max(60, 'Name must be 60 characters or fewer'),
  description: z.string().max(280, 'Description must be 280 characters or fewer').default(''),
  iconUrl: customBlockIconUrlV1Schema.optional(),
  inputs: z.array(customBlockInputOverrideV1Schema).max(50).optional(),
  exposedOutputs: z.array(customBlockOutputWriteV1Schema).max(50).optional(),
})

export const updateCustomBlockBodyV1Schema = z
  .object({
    name: z.string().min(1).max(60).optional(),
    description: z.string().max(280).optional(),
    enabled: z.boolean().optional(),
    iconUrl: customBlockIconUrlV1Schema.nullable().optional(),
    inputs: z.array(customBlockInputOverrideV1Schema).max(50).optional(),
    exposedOutputs: z.array(customBlockOutputWriteV1Schema).max(50).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  })

export const customBlockUsageCountsV1Schema = z
  .object({
    usageCount: z.number().int().nonnegative(),
    deployedUsageCount: z.number().int().nonnegative(),
  })
  .strict()

export const listCustomBlocksResponseV1Schema = z
  .object({
    enabled: z.boolean(),
    customBlocks: z.array(customBlockV1Schema),
  })
  .strict()

export const publishCustomBlockResponseV1Schema = z
  .object({ customBlock: customBlockV1Schema })
  .strict()
export const customBlockMutationResponseV1Schema = z.object({ success: z.literal(true) }).strict()

export const blockVisibilityResponseV1Schema = z
  .object({
    revealed: z.array(z.string()),
    disabled: z.array(z.string()),
    previewTagged: z.array(z.string()),
  })
  .strict()

export const customBlockRouteV1Schema = z
  .object({
    inventoryId: z.enum(['API-0045', 'API-0094', 'API-0095', 'API-0096']),
    methods: z.array(z.enum(['GET', 'POST', 'PATCH', 'DELETE'])).min(1),
    pathTemplate: z.string().startsWith('/api/'),
    authMode: z.literal('session'),
  })
  .strict()

export const customBlockRoutesV1 = [
  {
    inventoryId: 'API-0045',
    methods: ['GET'],
    pathTemplate: '/api/blocks/visibility',
    authMode: 'session',
  },
  {
    inventoryId: 'API-0094',
    methods: ['PATCH', 'DELETE'],
    pathTemplate: '/api/custom-blocks/[id]',
    authMode: 'session',
  },
  {
    inventoryId: 'API-0095',
    methods: ['GET'],
    pathTemplate: '/api/custom-blocks/[id]/usages',
    authMode: 'session',
  },
  {
    inventoryId: 'API-0096',
    methods: ['GET', 'POST'],
    pathTemplate: '/api/custom-blocks',
    authMode: 'session',
  },
] as const

export type CustomBlockInputV1 = z.infer<typeof customBlockInputV1Schema>
export type CustomBlockInputOverrideV1 = z.infer<typeof customBlockInputOverrideV1Schema>
export type CustomBlockOutputV1 = z.infer<typeof customBlockOutputV1Schema>
export type CustomBlockV1 = z.infer<typeof customBlockV1Schema>
export type PublishCustomBlockBodyV1 = z.input<typeof publishCustomBlockBodyV1Schema>
export type UpdateCustomBlockBodyV1 = z.input<typeof updateCustomBlockBodyV1Schema>
export type CustomBlockUsageCountsV1 = z.infer<typeof customBlockUsageCountsV1Schema>
export type BlockVisibilityResponseV1 = z.infer<typeof blockVisibilityResponseV1Schema>
export type CustomBlockRouteV1 = z.infer<typeof customBlockRouteV1Schema>

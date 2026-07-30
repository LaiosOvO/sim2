import {
  type CustomBlockInputOverrideV1,
  type CustomBlockUsageCountsV1,
  type CustomBlockV1,
  customBlockIconUrlV1Schema,
  customBlockIdParamsV1Schema,
  customBlockMutationResponseV1Schema,
  customBlockUsageCountsV1Schema,
  customBlockV1Schema,
  listCustomBlocksQueryV1Schema,
  listCustomBlocksResponseV1Schema,
  type PublishCustomBlockBodyV1,
  publishCustomBlockBodyV1Schema,
  publishCustomBlockResponseV1Schema,
  type UpdateCustomBlockBodyV1,
  updateCustomBlockBodyV1Schema,
} from '@sim/api-contracts/custom-blocks'
import { defineRouteContract } from '@/lib/api/contracts/types'

export const customBlockSchema = customBlockV1Schema
export const publishCustomBlockBodySchema = publishCustomBlockBodyV1Schema
export const updateCustomBlockBodySchema = updateCustomBlockBodyV1Schema
export const customBlockUsageCountsSchema = customBlockUsageCountsV1Schema

export type CustomBlock = CustomBlockV1
export type CustomBlockInputPlaceholder = CustomBlockInputOverrideV1
export type PublishCustomBlockBody = PublishCustomBlockBodyV1
export type UpdateCustomBlockBody = UpdateCustomBlockBodyV1
export type CustomBlockUsageCounts = CustomBlockUsageCountsV1

export function isAllowedCustomBlockIconUrl(value: string): boolean {
  return customBlockIconUrlV1Schema.safeParse(value).success
}

export const listCustomBlocksContract = defineRouteContract({
  method: 'GET',
  path: '/api/custom-blocks',
  query: listCustomBlocksQueryV1Schema,
  response: { mode: 'json', schema: listCustomBlocksResponseV1Schema },
})

export const publishCustomBlockContract = defineRouteContract({
  method: 'POST',
  path: '/api/custom-blocks',
  body: publishCustomBlockBodyV1Schema,
  response: { mode: 'json', schema: publishCustomBlockResponseV1Schema },
})

export const updateCustomBlockContract = defineRouteContract({
  method: 'PATCH',
  path: '/api/custom-blocks/[id]',
  params: customBlockIdParamsV1Schema,
  body: updateCustomBlockBodyV1Schema,
  response: { mode: 'json', schema: customBlockMutationResponseV1Schema },
})

export const deleteCustomBlockContract = defineRouteContract({
  method: 'DELETE',
  path: '/api/custom-blocks/[id]',
  params: customBlockIdParamsV1Schema,
  response: { mode: 'json', schema: customBlockMutationResponseV1Schema },
})

export const getCustomBlockUsageCountsContract = defineRouteContract({
  method: 'GET',
  path: '/api/custom-blocks/[id]/usages',
  params: customBlockIdParamsV1Schema,
  response: { mode: 'json', schema: customBlockUsageCountsV1Schema },
})

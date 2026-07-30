import {
  type BlockVisibilityResponseV1,
  blockVisibilityResponseV1Schema,
  listCustomBlocksQueryV1Schema,
} from '@sim/api-contracts/custom-blocks'
import { defineRouteContract } from '@/lib/api/contracts'

export type GetBlockVisibilityQuery = { workspaceId: string }
export type BlockVisibilityResponse = BlockVisibilityResponseV1

export const getBlockVisibilityContract = defineRouteContract({
  method: 'GET',
  path: '/api/blocks/visibility',
  query: listCustomBlocksQueryV1Schema,
  response: {
    mode: 'json',
    schema: blockVisibilityResponseV1Schema,
  },
})

import {
  type ForkCopyableFileV1,
  type ForkCopyableResourceV1,
  forkCopyableFileV1Schema,
  forkCopyableResourceV1Schema,
  forkWorkspaceIdParamsV1Schema,
  type GetForkResourcesResponseV1,
  getForkResourcesResponseV1Schema,
} from '@sim/api-contracts/workspace-forking'
import { defineRouteContract } from '@/lib/api/contracts/types'

export const forkCopyableResourceSchema = forkCopyableResourceV1Schema
export const forkCopyableFileSchema = forkCopyableFileV1Schema

export type ForkCopyableResource = ForkCopyableResourceV1
export type ForkCopyableFile = ForkCopyableFileV1
export type GetForkResourcesResponse = GetForkResourcesResponseV1

/**
 * Focused browser entry for the fork resource picker. Keep this separate from
 * the promote/mapping/diff contract graph so opening the modal does not compile
 * the complete workspace-forking protocol.
 */
export const getForkResourcesContract = defineRouteContract({
  method: 'GET',
  path: '/api/workspaces/[id]/fork/resources',
  params: forkWorkspaceIdParamsV1Schema,
  response: {
    mode: 'json',
    schema: getForkResourcesResponseV1Schema,
  },
})

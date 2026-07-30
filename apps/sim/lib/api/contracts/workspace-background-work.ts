import {
  type ListWorkspaceBackgroundWorkResponseV1,
  listWorkspaceBackgroundWorkContractV1,
  type WorkspaceBackgroundWorkItemV1,
} from '@sim/api-contracts/workspace-background-work'
import { defineRouteContract } from '@/lib/api/contracts/types'

export type BackgroundWorkItem = WorkspaceBackgroundWorkItemV1
export type GetWorkspaceBackgroundWorkResponse = ListWorkspaceBackgroundWorkResponseV1

/**
 * Focused browser contract for the workspace activity feed. The local wrapper
 * preserves the Sim request client's exact optional-slice generics without
 * importing the legacy workspace-fork contract graph.
 */
export const getWorkspaceBackgroundWorkContract = defineRouteContract(
  listWorkspaceBackgroundWorkContractV1
)

import type { AuthenticatedRequestContext } from '@sim/api-contracts/auth'

export type WorkflowReadAuthorization =
  | { allowed: true; workspaceId: string }
  | { allowed: false; status: number; message: string }

/**
 * Authorizes a durable workflow read and returns the workspace scope that owns
 * every downstream execution projection.
 */
export interface WorkflowReadAuthorizer {
  authorize(
    context: AuthenticatedRequestContext,
    workflowId: string
  ): Promise<WorkflowReadAuthorization>
}

export interface WorkflowReadScope {
  workspaceId: string | null
}

/**
 * Finds the workflow's owning scope before permission evaluation. Keeping this
 * lookup explicit preserves donor error precedence for missing and historical
 * personal workflows without exposing the workflow persistence model.
 */
export interface WorkflowReadScopeReader {
  readScope(workflowId: string): Promise<WorkflowReadScope | null>
}

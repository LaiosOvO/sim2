import type { AuthenticatedRequestContext } from '@sim/api-contracts/auth'
import { authorizeWorkflowByWorkspacePermission } from '@sim/platform-authz/workflow'
import type {
  WorkflowReadAuthorization,
  WorkflowReadAuthorizer,
  WorkflowReadScopeReader,
} from '@/modules/execution/read'

function workspaceKeyMismatch(context: AuthenticatedRequestContext, workspaceId: string): boolean {
  return (
    context.authenticationMethod === 'api-key' &&
    context.keyType === 'workspace' &&
    context.workspaceId !== workspaceId
  )
}

export interface PlatformWorkflowReadAuthorizerDependencies {
  scopes: WorkflowReadScopeReader
  authorize?: typeof authorizeWorkflowByWorkspacePermission
}

export function createPlatformWorkflowReadAuthorizer(
  dependencies: PlatformWorkflowReadAuthorizerDependencies
): WorkflowReadAuthorizer {
  const authorize = dependencies.authorize ?? authorizeWorkflowByWorkspacePermission
  return {
    async authorize(context, workflowId): Promise<WorkflowReadAuthorization> {
      if (context.actor.type !== 'user') {
        return { allowed: false, status: 401, message: 'Unauthorized' }
      }

      const scope = await dependencies.scopes.readScope(workflowId)
      if (!scope) {
        return { allowed: false, status: 404, message: 'Workflow not found' }
      }
      if (!scope.workspaceId) {
        return {
          allowed: false,
          status: 403,
          message:
            'This workflow is not attached to a workspace. Personal workflows are deprecated and cannot be accessed.',
        }
      }
      if (workspaceKeyMismatch(context, scope.workspaceId)) {
        return {
          allowed: false,
          status: 403,
          message: 'API key is not authorized for this workspace',
        }
      }

      const authorization = await authorize({
        workflowId,
        userId: context.actor.id,
        action: 'read',
      })
      if (!authorization.allowed) {
        return {
          allowed: false,
          status: authorization.status,
          message: authorization.message ?? 'Access denied',
        }
      }

      return { allowed: true, workspaceId: scope.workspaceId }
    },
  }
}

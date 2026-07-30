import {
  type PausedExecutionDetailV1,
  pausedExecutionDetailV1Schema,
  resumeExecutionParamsV1Schema,
} from '@sim/api-contracts'
import type { AuthenticatedRequestContext } from '@sim/api-contracts/auth'
import type { PausedExecutionReader } from '@/modules/execution/read/ports/paused-execution-reader'
import type { WorkflowReadAuthorizer } from '@/modules/execution/read/ports/workflow-read-authorizer'

export type GetPausedExecutionResult =
  | { ok: true; value: PausedExecutionDetailV1 }
  | { ok: false; reason: 'validation-error'; details: readonly unknown[] }
  | { ok: false; reason: 'access-error'; status: number; message: string }
  | { ok: false; reason: 'not-found' }

export interface GetPausedExecutionUseCase {
  execute(
    context: AuthenticatedRequestContext,
    input: { workflowId: string; executionId: string }
  ): Promise<GetPausedExecutionResult>
}

export interface GetPausedExecutionDependencies {
  authorizer: WorkflowReadAuthorizer
  reader: PausedExecutionReader
}

export function createGetPausedExecutionUseCase(
  dependencies: GetPausedExecutionDependencies
): GetPausedExecutionUseCase {
  return {
    async execute(context, input) {
      const params = resumeExecutionParamsV1Schema.safeParse(input)
      if (!params.success) {
        return {
          ok: false,
          reason: 'validation-error',
          details: params.error.issues,
        }
      }

      const authorization = await dependencies.authorizer.authorize(context, params.data.workflowId)
      if (!authorization.allowed) {
        return {
          ok: false,
          reason: 'access-error',
          status: authorization.status,
          message: authorization.message,
        }
      }

      const detail = await dependencies.reader.readDetail(
        params.data.workflowId,
        params.data.executionId
      )
      if (!detail) return { ok: false, reason: 'not-found' }
      return {
        ok: true,
        value: pausedExecutionDetailV1Schema.parse(detail),
      }
    },
  }
}

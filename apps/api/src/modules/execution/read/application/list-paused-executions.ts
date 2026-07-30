import {
  type PausedExecutionListResponseV1,
  pausedExecutionListQueryV1Schema,
  pausedExecutionListResponseV1Schema,
  workflowIdParamsV1Schema,
} from '@sim/api-contracts'
import type { AuthenticatedRequestContext } from '@sim/api-contracts/auth'
import type { PausedExecutionReader } from '@/modules/execution/read/ports/paused-execution-reader'
import type { WorkflowReadAuthorizer } from '@/modules/execution/read/ports/workflow-read-authorizer'

export type ListPausedExecutionsResult =
  | { ok: true; value: PausedExecutionListResponseV1 }
  | { ok: false; reason: 'validation-error'; details: readonly unknown[] }
  | { ok: false; reason: 'access-error'; status: number; message: string }

export interface ListPausedExecutionsUseCase {
  execute(
    context: AuthenticatedRequestContext,
    input: { workflowId: string; status?: string }
  ): Promise<ListPausedExecutionsResult>
}

export interface ListPausedExecutionsDependencies {
  authorizer: WorkflowReadAuthorizer
  reader: PausedExecutionReader
}

function statuses(status: string | undefined): readonly string[] | undefined {
  if (!status) return undefined
  return status.split(',').map((value) => value.trim())
}

export function createListPausedExecutionsUseCase(
  dependencies: ListPausedExecutionsDependencies
): ListPausedExecutionsUseCase {
  return {
    async execute(context, input) {
      const params = workflowIdParamsV1Schema.safeParse({ id: input.workflowId })
      const query = pausedExecutionListQueryV1Schema.safeParse({ status: input.status })
      if (!params.success || !query.success) {
        return {
          ok: false,
          reason: 'validation-error',
          details: [
            ...(params.success ? [] : params.error.issues),
            ...(query.success ? [] : query.error.issues),
          ],
        }
      }

      const authorization = await dependencies.authorizer.authorize(context, params.data.id)
      if (!authorization.allowed) {
        return {
          ok: false,
          reason: 'access-error',
          status: authorization.status,
          message: authorization.message,
        }
      }

      const pausedExecutions = await dependencies.reader.list(params.data.id, {
        statuses: statuses(query.data.status),
      })
      return {
        ok: true,
        value: pausedExecutionListResponseV1Schema.parse({ pausedExecutions }),
      }
    },
  }
}

import { EXECUTION_CONTRACTS_VERSION } from '@sim/execution-contracts'
import {
  type ExecutionObjectReadCommandV1,
  executionObjectReadCommandV1Schema,
  executionObjectReadResultV1Schema,
} from '@sim/execution-contracts/execution-object-read'
import { safeCompare } from '@sim/security/compare'
import { toError } from '@sim/utils/errors'

const maximumCommandBytes = 64 * 1024

export interface InternalExecutionObjectReader {
  read(command: ExecutionObjectReadCommandV1): Promise<unknown | null>
}

export interface InternalExecutionObjectReadHandlerOptions {
  internalToken: string | undefined
  objects: InternalExecutionObjectReader
}

function result(
  status: number,
  body: Parameters<typeof executionObjectReadResultV1Schema.parse>[0]
): Response {
  return Response.json(executionObjectReadResultV1Schema.parse(body), { status })
}

export function createInternalExecutionObjectReadHandler(
  options: InternalExecutionObjectReadHandlerOptions
): (request: Request) => Promise<Response> {
  return async (request) => {
    const authorization = request.headers.get('authorization')
    if (
      !options.internalToken ||
      !authorization ||
      !safeCompare(authorization, `Bearer ${options.internalToken}`)
    ) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const contentLength = Number(request.headers.get('content-length'))
    if (Number.isFinite(contentLength) && contentLength > maximumCommandBytes) {
      return Response.json({ error: 'EXECUTION_OBJECT_COMMAND_TOO_LARGE' }, { status: 413 })
    }
    let candidate: unknown
    try {
      const text = await request.text()
      if (Buffer.byteLength(text, 'utf8') > maximumCommandBytes) {
        return Response.json({ error: 'EXECUTION_OBJECT_COMMAND_TOO_LARGE' }, { status: 413 })
      }
      candidate = JSON.parse(text)
    } catch {
      return Response.json({ error: 'EXECUTION_OBJECT_COMMAND_INVALID' }, { status: 400 })
    }
    const command = executionObjectReadCommandV1Schema.safeParse(candidate)
    if (!command.success) {
      return Response.json({ error: 'EXECUTION_OBJECT_COMMAND_INVALID' }, { status: 400 })
    }

    try {
      const data = await options.objects.read(command.data)
      return data === null
        ? result(404, {
            contractVersion: EXECUTION_CONTRACTS_VERSION,
            requestId: command.data.requestId,
            status: 'missing',
          })
        : result(200, {
            contractVersion: EXECUTION_CONTRACTS_VERSION,
            requestId: command.data.requestId,
            status: 'found',
            data,
          })
    } catch (error) {
      return result(503, {
        contractVersion: EXECUTION_CONTRACTS_VERSION,
        requestId: command.data.requestId,
        status: 'unavailable',
        error: toError(error).message.slice(0, 1000) || 'Execution object store unavailable',
      })
    }
  }
}

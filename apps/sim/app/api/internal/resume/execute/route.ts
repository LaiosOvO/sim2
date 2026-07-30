import { safeCompare } from '@sim/security/compare'
import { toError } from '@sim/utils/errors'
import {
  resumeExecutionCommandV1Schema,
  resumeExecutionResultV1Schema,
} from '@/lib/api/contracts/internal-resume-execution'
import { env } from '@/lib/core/config/env'
import { isRetryableInfrastructureError } from '@/lib/core/errors/retryable-infrastructure'

export const dynamic = 'force-dynamic'
export const maxDuration = 120
const maximumResumeBodyBytes = 40 * 1024 * 1024

function authorized(request: Request): boolean {
  const token = env.INTERNAL_EXECUTION_TOKEN || env.INTERNAL_API_SECRET
  const authorization = request.headers.get('authorization')
  return Boolean(token && authorization && safeCompare(authorization, `Bearer ${token}`))
}

export async function POST(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    const contentLength = Number(request.headers.get('content-length'))
    if (Number.isFinite(contentLength) && contentLength > maximumResumeBodyBytes) {
      return Response.json({ error: 'RESUME_EXECUTION_COMMAND_TOO_LARGE' }, { status: 413 })
    }
    const text = await request.text()
    if (Buffer.byteLength(text, 'utf8') > maximumResumeBodyBytes) {
      return Response.json({ error: 'RESUME_EXECUTION_COMMAND_TOO_LARGE' }, { status: 413 })
    }
    body = JSON.parse(text)
  } catch {
    return Response.json({ error: 'RESUME_EXECUTION_COMMAND_INVALID' }, { status: 400 })
  }
  const command = resumeExecutionCommandV1Schema.safeParse(body)
  if (!command.success || request.headers.get('idempotency-key') !== command.data.resumeEntryId) {
    return Response.json({ error: 'RESUME_EXECUTION_COMMAND_INVALID' }, { status: 400 })
  }

  try {
    // Transitional server-only bridge. The browser never imports this module;
    // Worker can own durable admission before the Executor itself moves out of Next.
    const { executeResumeJob } = await import('@/background/resume-execution')
    const result = await executeResumeJob({
      resumeEntryId: command.data.resumeEntryId,
      resumeExecutionId: command.data.executionId,
      pausedExecutionId: command.data.pausedExecutionId,
      contextId: command.data.contextId,
      resumeInput: command.data.input,
      userId: command.data.userId,
      workflowId: command.data.workflowId,
      parentExecutionId: command.data.executionId,
    })
    if (result.success && (result.status === 'completed' || result.status === 'paused')) {
      return Response.json(
        resumeExecutionResultV1Schema.parse({
          contractVersion: command.data.contractVersion,
          ok: true,
          status: result.status,
          output: result.output,
        })
      )
    }
    return Response.json(
      resumeExecutionResultV1Schema.parse({
        contractVersion: command.data.contractVersion,
        ok: false,
        retryable: false,
        error: `Resume execution ended with ${result.status}`,
      })
    )
  } catch (error) {
    return Response.json(
      resumeExecutionResultV1Schema.parse({
        contractVersion: command.data.contractVersion,
        ok: false,
        retryable: isRetryableInfrastructureError(error),
        error: toError(error).message,
      })
    )
  }
}

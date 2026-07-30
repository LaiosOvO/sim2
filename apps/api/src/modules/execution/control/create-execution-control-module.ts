import { timingSafeEqual } from 'node:crypto'
import {
  jobStatusParamsV1Schema,
  jobStatusResponseV1Schema,
  resumePollResponseV1Schema,
  type WorkflowExecutionStatusResponseV1,
  workflowExecutionStatusParamsV1Schema,
  workflowExecutionStatusQueryV1Schema,
  workflowExecutionStatusResponseV1Schema,
} from '@sim/api-contracts/execution-control'
import type { RequestAuthenticator } from '@sim/auth/request-context'
import type { ApiRequestContext } from '@/http/request-context'
import type {
  ExecutionPayloadMaterializer,
  ExecutionStatusReader,
  JobStatusReader,
  ResumePollCommandPort,
} from '@/modules/execution/control/ports'
import { ExecutionPayloadUnavailableError } from '@/modules/execution/control/ports'
import type { WorkflowReadAuthorizer } from '@/modules/execution/read'

const jobPattern = /^\/api\/jobs\/([^/]+)$/
const executionPattern = /^\/api\/workflows\/([^/]+)\/executions\/([^/]+)$/

interface PausePoint {
  resumeStatus?: string
  resumeAt?: string
  pauseKind?: 'time' | 'human'
  blockId?: string
  automaticResumeWaitingReason?: string
}

interface TraceSpan {
  blockId?: string
  output?: Record<string, unknown>
  children?: TraceSpan[]
}

interface ExecutionData {
  finalOutput?: Record<string, unknown>
  error?: string | { message?: string }
  completionFailure?: string
  traceSpans?: TraceSpan[]
}

export interface ExecutionControlModule {
  handle(request: Request, context: ApiRequestContext): Promise<Response | undefined>
}

export interface ExecutionControlModuleDependencies {
  authentication: RequestAuthenticator
  workflowAuthorizer: WorkflowReadAuthorizer
  jobs: JobStatusReader
  executions: ExecutionStatusReader
  payloads: ExecutionPayloadMaterializer
  resumePoll: ResumePollCommandPort
  cronSecret?: string
}

function decode(value: string | undefined): string {
  try {
    return decodeURIComponent(value ?? '')
  } catch {
    return ''
  }
}

function observed(response: Response, inventoryId: string): Response {
  const headers = new Headers(response.headers)
  headers.set('x-sim-api-module', 'execution-control')
  headers.set('x-sim-api-inventory-id', inventoryId)
  headers.set('x-sim-api-backend', 'native')
  return new Response(response.body, { status: response.status, headers })
}

function authorizedCron(request: Request, secret: string | undefined): boolean {
  if (!secret) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const actual = Buffer.from(request.headers.get('authorization') ?? '')
  return expected.byteLength === actual.byteLength && timingSafeEqual(expected, actual)
}

function normalizePoints(raw: unknown): PausePoint[] {
  if (Array.isArray(raw)) return raw.filter((value): value is PausePoint => !!value)
  if (raw && typeof raw === 'object') return Object.values(raw) as PausePoint[]
  return []
}

function earliestPause(points: PausePoint[]): PausePoint | null {
  const active = points.filter((point) => point.resumeStatus === 'paused')
  return active.reduce<PausePoint | null>((best, current) => {
    if (!best) return current
    if (!current.resumeAt) return best
    if (!best.resumeAt) return current
    return current.resumeAt < best.resumeAt ? current : best
  }, null)
}

function waitingReason(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null
  const value = (metadata as Record<string, unknown>).automaticResumeWaiting
  if (!value || typeof value !== 'object') return null
  const reason = (value as Record<string, unknown>).reason
  return typeof reason === 'string' ? reason : null
}

function errorFrom(data: ExecutionData): string | null {
  if (typeof data.error === 'string') return data.error
  if (data.error && typeof data.error.message === 'string') return data.error.message
  if (typeof data.finalOutput?.error === 'string') return data.finalOutput.error
  return typeof data.completionFailure === 'string' ? data.completionFailure : null
}

function collectOutputs(spans: TraceSpan[] | undefined): Map<string, unknown> {
  const outputs = new Map<string, unknown>()
  const visit = (items: TraceSpan[] | undefined): void => {
    for (const span of items ?? []) {
      if (span.blockId && span.output !== undefined && !outputs.has(span.blockId)) {
        outputs.set(span.blockId, span.output)
      }
      visit(span.children)
    }
  }
  visit(spans)
  return outputs
}

function selectedOutputs(
  selectors: string[],
  outputs: Map<string, unknown>
): Record<string, unknown> {
  const selected: Record<string, unknown> = {}
  for (const selector of selectors) {
    const [blockId, ...path] = selector.split('.')
    if (!blockId || !outputs.has(blockId)) continue
    let value = outputs.get(blockId)
    for (const segment of path) {
      if (!value || typeof value !== 'object') {
        value = undefined
        break
      }
      value = (value as Record<string, unknown>)[segment]
    }
    selected[selector] = value
  }
  return selected
}

function withoutBody(response: Response): Response {
  return new Response(null, { status: response.status, headers: response.headers })
}

export function createExecutionControlModule(
  dependencies: ExecutionControlModuleDependencies
): ExecutionControlModule {
  return {
    async handle(request, context) {
      const url = new URL(request.url)
      const jobMatch = jobPattern.exec(url.pathname)
      const executionMatch = executionPattern.exec(url.pathname)
      const isPoll = url.pathname === '/api/resume/poll'
      const inventoryId = jobMatch
        ? 'API-0138'
        : isPoll
          ? 'API-0283'
          : executionMatch
            ? 'API-0993'
            : null
      if (!inventoryId) return undefined

      if (request.method === 'OPTIONS') {
        return observed(
          new Response(null, { status: 204, headers: { allow: 'GET, HEAD, OPTIONS' } }),
          inventoryId
        )
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return observed(new Response(null, { status: 405 }), inventoryId)
      }

      const jobParams = jobMatch
        ? jobStatusParamsV1Schema.safeParse({ jobId: decode(jobMatch[1]) })
        : null
      const executionParams = executionMatch
        ? workflowExecutionStatusParamsV1Schema.safeParse({
            id: decode(executionMatch[1]),
            executionId: decode(executionMatch[2]),
          })
        : null
      const executionQuery = executionMatch
        ? workflowExecutionStatusQueryV1Schema.safeParse(Object.fromEntries(url.searchParams))
        : null
      const validationFailure =
        jobParams?.success === false
          ? jobParams.error
          : executionParams?.success === false
            ? executionParams.error
            : executionQuery?.success === false
              ? executionQuery.error
              : null
      if (validationFailure) {
        return observed(
          Response.json(
            { error: 'Validation error', details: validationFailure.issues },
            { status: 400 }
          ),
          inventoryId
        )
      }

      if (isPoll) {
        if (!authorizedCron(request, dependencies.cronSecret)) {
          return observed(Response.json({ error: 'Unauthorized' }, { status: 401 }), inventoryId)
        }
        try {
          const result = await dependencies.resumePoll.run(context.requestId)
          const response = resumePollResponseV1Schema.parse({
            success: true,
            requestId: result.commandId,
            claimedRows: result.claimedRows,
            dispatched: result.dispatched,
            failures: result.failures,
            message: result.message,
          })
          const json = observed(
            Response.json(response, { status: result.status === 'skipped' ? 202 : 200 }),
            inventoryId
          )
          return request.method === 'HEAD' ? withoutBody(json) : json
        } catch {
          return observed(
            Response.json(
              resumePollResponseV1Schema.parse({
                success: false,
                requestId: context.requestId,
                error: 'Resume polling is unavailable',
              }),
              { status: 503 }
            ),
            inventoryId
          )
        }
      }

      const authentication = await dependencies.authentication.authenticate({
        request,
        requestId: context.requestId,
        policy: {
          mode: 'hybrid',
          allowed: ['session', 'api-key', 'internal'],
          internalActor: 'either',
        },
      })
      if (!authentication.ok || authentication.context.actor.type !== 'user') {
        const status = authentication.ok ? 401 : authentication.error.status
        return observed(
          Response.json({ error: 'Authentication required' }, { status }),
          inventoryId
        )
      }

      if (jobMatch) {
        if (!jobParams?.success) throw new Error('Validated job params are unavailable')
        try {
          const job = await dependencies.jobs.read(jobParams.data.jobId)
          if (!job)
            return observed(
              Response.json({ error: 'Task not found' }, { status: 404 }),
              inventoryId
            )
          const workflowId =
            typeof job.metadata?.workflowId === 'string' ? job.metadata.workflowId : null
          const userId = typeof job.metadata?.userId === 'string' ? job.metadata.userId : null
          if (workflowId) {
            const access = await dependencies.workflowAuthorizer.authorize(
              authentication.context,
              workflowId
            )
            if (!access.allowed)
              return observed(
                Response.json(
                  { error: 'Access denied' },
                  { status: access.status === 404 ? 403 : access.status }
                ),
                inventoryId
              )
          } else if (!userId || userId !== authentication.context.actor.id) {
            return observed(Response.json({ error: 'Access denied' }, { status: 403 }), inventoryId)
          }
          const json = observed(
            Response.json(
              jobStatusResponseV1Schema.parse({
                success: true,
                taskId: job.id,
                status: job.status,
                metadata: job.metadata,
                ...(job.output !== undefined ? { output: job.output } : {}),
                ...(job.error !== undefined ? { error: job.error } : {}),
              })
            ),
            inventoryId
          )
          return request.method === 'HEAD' ? withoutBody(json) : json
        } catch (error) {
          if (error instanceof Error && error.message.toLowerCase().includes('not found')) {
            return observed(
              Response.json({ error: 'Task not found' }, { status: 404 }),
              inventoryId
            )
          }
          return observed(
            Response.json({ error: 'Failed to fetch task status' }, { status: 500 }),
            inventoryId
          )
        }
      }

      if (!executionParams?.success || !executionQuery?.success) {
        throw new Error('Validated execution params are unavailable')
      }
      const access = await dependencies.workflowAuthorizer.authorize(
        authentication.context,
        executionParams.data.id
      )
      if (!access.allowed)
        return observed(
          Response.json({ error: access.message }, { status: access.status }),
          inventoryId
        )
      try {
        const statusView = await dependencies.executions.read(
          executionParams.data.id,
          executionParams.data.executionId
        )
        if (!statusView)
          return observed(
            Response.json({ error: 'Execution not found' }, { status: 404 }),
            inventoryId
          )
        const { execution: row, paused: pausedRow } = statusView
        const isPaused = pausedRow?.status === 'paused' || pausedRow?.status === 'partially_resumed'
        const status = isPaused ? 'paused' : row.status
        const points = isPaused && pausedRow ? normalizePoints(pausedRow.pausePoints) : []
        const earliest = earliestPause(points)
        const needsPayload =
          status === 'failed' ||
          executionQuery.data.includeOutput ||
          executionQuery.data.selectedOutputs.length > 0
        const data = (
          needsPayload ? await dependencies.payloads.materialize(row) : {}
        ) as ExecutionData
        const response: WorkflowExecutionStatusResponseV1 = {
          executionId: row.executionId,
          workflowId: row.workflowId ?? executionParams.data.id,
          status: status as WorkflowExecutionStatusResponseV1['status'],
          trigger: row.trigger,
          level: row.level,
          startedAt: row.startedAt.toISOString(),
          endedAt: row.endedAt?.toISOString() ?? null,
          totalDurationMs: row.totalDurationMs,
          paused:
            isPaused && pausedRow
              ? {
                  pausedAt: pausedRow.pausedAt.toISOString(),
                  resumeAt: pausedRow.nextResumeAt?.toISOString() ?? earliest?.resumeAt ?? null,
                  pauseKind: earliest?.pauseKind ?? null,
                  blockedOnBlockId: earliest?.blockId ?? null,
                  automaticResumeWaitingReason:
                    waitingReason(pausedRow.metadata) ??
                    earliest?.automaticResumeWaitingReason ??
                    null,
                  pausedExecutionId: pausedRow.id,
                  pausePointCount: points.length,
                  resumedCount: pausedRow.resumedCount,
                }
              : null,
          cost: row.costTotal === null ? null : { total: Number(row.costTotal) },
          error: status === 'failed' ? errorFrom(data) : null,
          finalOutput:
            executionQuery.data.includeOutput && status === 'completed'
              ? (data.finalOutput ?? null)
              : null,
          blockOutputs:
            executionQuery.data.selectedOutputs.length > 0
              ? selectedOutputs(
                  executionQuery.data.selectedOutputs,
                  collectOutputs(data.traceSpans)
                )
              : null,
        }
        const json = observed(
          Response.json(workflowExecutionStatusResponseV1Schema.parse(response)),
          inventoryId
        )
        return request.method === 'HEAD' ? withoutBody(json) : json
      } catch (error) {
        if (error instanceof ExecutionPayloadUnavailableError) {
          return observed(
            Response.json(
              { error: 'Execution payload service unavailable', requestId: context.requestId },
              { status: 503 }
            ),
            inventoryId
          )
        }
        return observed(
          Response.json(
            { error: 'Internal server error', requestId: context.requestId },
            { status: 500 }
          ),
          inventoryId
        )
      }
    },
  }
}

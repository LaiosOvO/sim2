import { timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { executionCancellationRequestV1Schema } from '@sim/execution-contracts/job-control'
import type { WorkerApplication } from '@/bootstrap/application/create-worker-application'
import { WorkerJobAdmissionFailure } from '@/bootstrap/application/create-worker-application'

const maximumBodyBytes = 1024 * 1024

function authorized(request: IncomingMessage, expectedToken: string | undefined): boolean {
  if (!expectedToken) return false
  const header = request.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''
  const actual = Buffer.from(token)
  const expected = Buffer.from(expectedToken)
  return actual.byteLength === expected.byteLength && timingSafeEqual(actual, expected)
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.byteLength
    if (size > maximumBodyBytes) throw new Error('request_body_too_large')
    chunks.push(buffer)
  }
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status
  response.setHeader('content-type', 'application/json')
  response.end(JSON.stringify(body))
}

export interface WorkerHttpServerOptions {
  application: WorkerApplication
  internalToken?: string
}

export function createWorkerHttpServer(options: WorkerHttpServerOptions): Server {
  return createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`)
      if (request.method === 'GET' && url.pathname === '/internal/live') {
        json(response, 200, { status: 'ok', role: 'execution' })
        return
      }
      if (request.method === 'GET' && url.pathname === '/internal/ready') {
        const ready = Boolean(options.internalToken) && (await options.application.ready())
        json(response, ready ? 200 : 503, {
          status: ready ? 'ready' : 'not-ready',
          role: 'execution',
        })
        return
      }

      if (!authorized(request, options.internalToken)) {
        json(response, 401, { error: 'Unauthorized' })
        return
      }
      const events = /^\/internal\/executions\/([^/]+)\/events$/.exec(url.pathname)
      if (request.method === 'GET' && events) {
        json(response, 200, {
          events: await options.application.executionEvents(decodeURIComponent(events[1])),
        })
        return
      }
      if (request.method === 'POST' && url.pathname === '/internal/jobs') {
        try {
          json(response, 202, await options.application.submitJob(await readJson(request)))
        } catch (error) {
          if (error instanceof WorkerJobAdmissionFailure) {
            json(response, error.code === 'EXECUTION_JOB_INVALID' ? 400 : 503, {
              error: error.code,
              message: error.message,
            })
            return
          }
          throw error
        }
        return
      }
      if (request.method === 'POST' && url.pathname === '/internal/resume/poll') {
        try {
          json(response, 200, await options.application.runResumePoll(await readJson(request)))
        } catch (error) {
          if (error instanceof WorkerJobAdmissionFailure) {
            json(response, error.code === 'EXECUTION_JOB_INVALID' ? 400 : 503, {
              error: error.code,
              message: error.message,
            })
            return
          }
          throw error
        }
        return
      }
      if (request.method === 'POST' && url.pathname === '/internal/approvals/resume') {
        try {
          json(response, 202, await options.application.resumeApproval(await readJson(request)))
        } catch (error) {
          if (error instanceof WorkerJobAdmissionFailure) {
            json(response, error.code === 'EXECUTION_JOB_INVALID' ? 400 : 503, {
              error: error.code,
              message: error.message,
            })
            return
          }
          throw error
        }
        return
      }
      if (request.method === 'POST' && url.pathname === '/internal/approvals/effects') {
        try {
          json(
            response,
            202,
            await options.application.enqueueApprovalEffect(await readJson(request))
          )
        } catch (error) {
          if (error instanceof WorkerJobAdmissionFailure) {
            json(response, error.code === 'EXECUTION_JOB_INVALID' ? 400 : 503, {
              error: error.code,
              message: error.message,
            })
            return
          }
          throw error
        }
        return
      }

      const cancellation = /^\/internal\/executions\/([^/]+)\/cancel$/.exec(url.pathname)
      if (request.method === 'POST' && cancellation) {
        const parsed = executionCancellationRequestV1Schema.safeParse(await readJson(request))
        if (!parsed.success) {
          json(response, 400, { error: 'EXECUTION_CANCELLATION_INVALID' })
          return
        }
        json(
          response,
          202,
          await options.application.cancelExecution(
            decodeURIComponent(cancellation[1]),
            parsed.data.reason
          )
        )
        return
      }

      json(response, 404, { error: 'Not found' })
    })().catch((error) => {
      const tooLarge = error instanceof Error && error.message === 'request_body_too_large'
      const invalidJson = error instanceof SyntaxError
      json(response, tooLarge ? 413 : invalidJson ? 400 : 500, {
        error: tooLarge
          ? 'Request body too large'
          : invalidJson
            ? 'Invalid JSON'
            : 'Internal server error',
      })
    })
  })
}

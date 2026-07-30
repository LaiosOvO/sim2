import { timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { EXECUTION_CONTRACTS_VERSION } from '@sim/execution-contracts'
import {
  sandboxExecutionCommandV1Schema,
  sandboxExecutionFailureV1Schema,
} from '@sim/execution-contracts/job-control'
import {
  resumeExecutionCommandV1Schema,
  resumeExecutionResultV1Schema,
} from '@sim/execution-contracts/resume-poll'
import type { ResumeExecutionRunner } from '@/jobs/resume/resume-execution-runner'
import { type SandboxExecution, SandboxExecutionFailure } from '@/sandbox/interface/types'

const maximumBodyBytes = 1024 * 1024
const maximumResumeBodyBytes = 40 * 1024 * 1024

function authorized(request: IncomingMessage, expectedToken: string | undefined): boolean {
  if (!expectedToken) return false
  const header = request.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''
  const actual = Buffer.from(token)
  const expected = Buffer.from(expectedToken)
  return actual.byteLength === expected.byteLength && timingSafeEqual(actual, expected)
}

async function readJson(
  request: IncomingMessage,
  maximumBytes = maximumBodyBytes
): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.byteLength
    if (size > maximumBytes) throw new Error('request_body_too_large')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status
  response.setHeader('content-type', 'application/json')
  response.end(JSON.stringify(body))
}

export interface SandboxHttpServerOptions {
  sandbox: SandboxExecution
  resumeExecution?: ResumeExecutionRunner
  internalToken?: string
}

export function createSandboxHttpServer(options: SandboxHttpServerOptions): Server {
  return createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`)
      if (request.method === 'GET' && url.pathname === '/internal/live') {
        json(response, 200, { status: 'ok', role: 'sandbox' })
        return
      }
      if (request.method === 'GET' && url.pathname === '/internal/ready') {
        const ready = Boolean(options.internalToken) && (await options.sandbox.health())
        json(response, ready ? 200 : 503, {
          status: ready ? 'ready' : 'not-ready',
          role: 'sandbox',
        })
        return
      }
      if (!authorized(request, options.internalToken)) {
        json(response, 401, { error: 'Unauthorized' })
        return
      }
      if (request.method === 'POST' && url.pathname === '/internal/resume/execute') {
        const command = resumeExecutionCommandV1Schema.safeParse(
          await readJson(request, maximumResumeBodyBytes)
        )
        if (!command.success) {
          json(response, 400, { error: 'RESUME_EXECUTION_COMMAND_INVALID' })
          return
        }
        if (!options.resumeExecution) {
          json(response, 503, { error: 'Resume execution engine is unavailable' })
          return
        }
        const result = resumeExecutionResultV1Schema.parse(
          await options.resumeExecution.execute(command.data)
        )
        json(response, result.ok || !result.retryable ? 200 : 503, result)
        return
      }
      if (request.method !== 'POST' || url.pathname !== '/internal/sandbox/execute') {
        json(response, 404, { error: 'Not found' })
        return
      }

      const command = sandboxExecutionCommandV1Schema.safeParse(await readJson(request))
      if (!command.success) {
        json(response, 400, { error: 'SANDBOX_COMMAND_INVALID' })
        return
      }
      const controller = new AbortController()
      const timeout = setTimeout(() => {
        controller.abort(
          new SandboxExecutionFailure(
            'SANDBOX_TIMEOUT',
            `Sandbox exceeded ${command.data.payload.policy.wallClockMs} ms`,
            false
          )
        )
      }, command.data.payload.policy.wallClockMs)
      timeout.unref?.()
      request.once('aborted', () => {
        controller.abort(
          new SandboxExecutionFailure('SANDBOX_CANCELLED', 'Sandbox client disconnected', false)
        )
      })

      try {
        json(
          response,
          200,
          await options.sandbox.execute({
            executionId: command.data.executionId,
            attempt: command.data.attempt,
            payload: command.data.payload,
            signal: controller.signal,
          })
        )
      } catch (error) {
        const failure =
          error instanceof SandboxExecutionFailure
            ? error
            : new SandboxExecutionFailure(
                'SANDBOX_FATAL_FAILURE',
                error instanceof Error ? error.message : 'Sandbox execution failed',
                false
              )
        json(
          response,
          failure.retryable ? 503 : 422,
          sandboxExecutionFailureV1Schema.parse({
            contractVersion: EXECUTION_CONTRACTS_VERSION,
            error: {
              code: failure.code,
              message: failure.message,
              retryable: failure.retryable,
            },
          })
        )
      } finally {
        clearTimeout(timeout)
      }
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

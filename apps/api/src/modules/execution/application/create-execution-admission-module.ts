import { timingSafeEqual } from 'node:crypto'
import {
  executionCancellationRequestV1Schema,
  sandboxTestJobPayloadV1Schema,
} from '@sim/execution-contracts/job-control'
import { executionJobV1Schema } from '@sim/execution-contracts/jobs'
import type { ExecutionJobSubmitter } from './ports'

export interface ExecutionAdmissionModule {
  handle(request: Request): Promise<Response | undefined>
}

export interface ExecutionAdmissionModuleOptions {
  internalToken: string
  submitter: ExecutionJobSubmitter
}

function authorized(headers: Headers, expectedToken: string): boolean {
  const header = headers.get('authorization')
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''
  const actual = Buffer.from(token)
  const expected = Buffer.from(expectedToken)
  return actual.byteLength === expected.byteLength && timingSafeEqual(actual, expected)
}

export function createExecutionAdmissionModule(
  options: ExecutionAdmissionModuleOptions
): ExecutionAdmissionModule {
  return {
    async handle(request) {
      const url = new URL(request.url)
      const isSubmit = request.method === 'POST' && url.pathname === '/internal/execution/jobs'
      const cancellation = /^\/internal\/execution\/executions\/([^/]+)\/cancel$/.exec(url.pathname)
      const isCancel = request.method === 'POST' && cancellation
      if (!isSubmit && !isCancel) return undefined
      if (!authorized(request.headers, options.internalToken)) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
      }

      let body: unknown
      try {
        body = await request.json()
      } catch {
        return Response.json({ error: 'Invalid request data' }, { status: 400 })
      }

      if (isSubmit) {
        const job = executionJobV1Schema.safeParse(body)
        if (!job.success || !sandboxTestJobPayloadV1Schema.safeParse(job.data.payload).success) {
          return Response.json({ error: 'Invalid execution job' }, { status: 400 })
        }
        try {
          return Response.json(await options.submitter.submit(job.data), { status: 202 })
        } catch {
          return Response.json({ error: 'Worker unavailable' }, { status: 503 })
        }
      }

      const command = executionCancellationRequestV1Schema.safeParse(body)
      if (!command.success) {
        return Response.json({ error: 'Invalid cancellation request' }, { status: 400 })
      }
      try {
        return Response.json(
          await options.submitter.cancel(decodeURIComponent(cancellation![1]), command.data.reason),
          { status: 202 }
        )
      } catch {
        return Response.json({ error: 'Worker unavailable' }, { status: 503 })
      }
    },
  }
}

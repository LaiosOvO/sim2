import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { SessionRequestContext } from '@sim/api-contracts/auth'
import { createRequestAuthenticator } from '@sim/auth/request-context'
import { EXECUTION_CONTRACTS_VERSION } from '@sim/execution-contracts'
import { describe, expect, it } from 'vitest'
import { createApiApplication } from '@/bootstrap/application/create-api-application'
import { createExecutionControlModule } from '@/modules/execution/control'
import { createHttpExecutionObjectStore } from '@/modules/execution/control/infrastructure/http-execution-object-store'
import { createObjectStoreExecutionPayloadMaterializer } from '@/modules/execution/control/infrastructure/object-store-execution-payload-materializer'

const disposableDatabaseEnabled =
  process.env.SIM_TEST_DATABASE_DISPOSABLE === '1' && Boolean(process.env.DATABASE_URL)

if (process.env.SIM_REQUIRE_POSTGRES_TEST === '1' && !disposableDatabaseEnabled) {
  throw new Error('PostgreSQL integration requires DATABASE_URL and SIM_TEST_DATABASE_DISPOSABLE=1')
}

const session: SessionRequestContext = {
  authContextVersion: 1,
  authenticationMethod: 'session',
  actor: { id: 'user-w6-handler', type: 'user' },
  requestId: 'request-w6-handler',
  credentialId: 'session-w6-handler',
  activeOrganizationId: null,
  permissions: [],
}

function authentication() {
  return createRequestAuthenticator({
    sessions: {
      async verify(headers) {
        return headers.get('cookie') === 'session=valid'
          ? {
              verified: true,
              credential: {
                actor: session.actor,
                sessionId: session.credentialId,
                activeOrganizationId: null,
              },
            }
          : { verified: false, reason: 'invalid' }
      },
    },
  })
}

function headersFrom(request: IncomingMessage): Headers {
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item)
    } else if (value !== undefined) {
      headers.set(name, value)
    }
  }
  return headers
}

async function sendFetchResponse(response: Response, target: ServerResponse): Promise<void> {
  target.statusCode = response.status
  response.headers.forEach((value, name) => target.setHeader(name, value))
  target.end(Buffer.from(await response.arrayBuffer()))
}

describe.runIf(disposableDatabaseEnabled)('native W6 execution-control PostgreSQL adapters', () => {
  it('reads jobs and tenant-bound execution status from real PostgreSQL rows', async () => {
    const [
      { db },
      { sql },
      { createDrizzleJobStatusReader },
      { createDrizzleExecutionStatusReader },
    ] = await Promise.all([
      import('@sim/db'),
      import('drizzle-orm'),
      import('@/modules/execution/control/infrastructure/drizzle-job-status-reader'),
      import('@/modules/execution/control/infrastructure/drizzle-execution-status-reader'),
    ])

    for (const statement of [
      `create table if not exists async_jobs (
        id text primary key, type text not null, payload jsonb not null,
        status text not null default 'pending', created_at timestamp not null default now(),
        started_at timestamp, completed_at timestamp, run_at timestamp,
        attempts integer not null default 0, max_attempts integer not null default 3,
        error text, output jsonb, metadata jsonb not null default '{}',
        updated_at timestamp not null default now()
      )`,
      `create table if not exists workflow_execution_logs (
        id text primary key, workflow_id text, workspace_id text not null,
        execution_id text not null unique, state_snapshot_id text not null,
        deployment_version_id text, level text not null, status text not null,
        trigger text not null, started_at timestamp not null, ended_at timestamp,
        total_duration_ms integer, execution_data jsonb not null default '{}',
        cost jsonb, cost_total decimal, models_used text[], files jsonb,
        created_at timestamp not null default now()
      )`,
      `create table if not exists paused_executions (
        id text primary key, workflow_id text not null, execution_id text not null unique,
        execution_snapshot jsonb not null, pause_points jsonb not null,
        total_pause_count integer not null, resumed_count integer not null default 0,
        automatic_resume_retry_count integer not null default 0,
        status text not null default 'paused', metadata jsonb not null default '{}',
        paused_at timestamp not null default now(), updated_at timestamp not null default now(),
        expires_at timestamp, next_resume_at timestamp
      )`,
      `delete from async_jobs where id = 'w6-control-job'`,
      `delete from paused_executions where execution_id = 'execution-control'`,
      `delete from workflow_execution_logs where execution_id = 'execution-control'`,
      `insert into async_jobs (id, type, payload, status, output, metadata)
       values ('w6-control-job', 'workflow', '{}', 'completed', '{"answer":42}',
               '{"userId":"user-1"}')`,
      `insert into workflow_execution_logs (
        id, workflow_id, workspace_id, execution_id, state_snapshot_id, level, status,
        trigger, started_at, ended_at, total_duration_ms, execution_data, cost_total
      ) values (
        'w6-control-log', 'workflow-control', 'workspace-control', 'execution-control',
        'snapshot-control', 'info', 'completed', 'api',
        '2026-07-30T00:00:00Z', '2026-07-30T00:00:01Z', 1000,
        '{"finalOutput":{"answer":42}}', 0.01
      )`,
    ]) {
      await db.execute(sql.raw(statement))
    }

    const jobs = createDrizzleJobStatusReader()
    await expect(jobs.read('w6-control-job')).resolves.toMatchObject({
      status: 'completed',
      output: { answer: 42 },
      metadata: { userId: 'user-1' },
    })

    let executionStatusQueries = 0
    const countedDatabase = new Proxy(db, {
      get(target, property, receiver) {
        if (property !== 'select') return Reflect.get(target, property, receiver)
        return (...args: Parameters<typeof db.select>) => {
          executionStatusQueries++
          return target.select(...args)
        }
      },
    })
    const executions = createDrizzleExecutionStatusReader({ database: countedDatabase })
    await expect(executions.read('workflow-control', 'execution-control')).resolves.toMatchObject({
      execution: {
        workspaceId: 'workspace-control',
        executionData: { finalOutput: { answer: 42 } },
      },
      paused: null,
    })
    expect(executionStatusQueries).toBe(1)
    await expect(executions.read('workflow-other', 'execution-control')).resolves.toBeNull()
    expect(executionStatusQueries).toBe(2)
  })

  it('bounds API-0993 at one SQL query and one authenticated object HTTP read', async () => {
    const [
      { db },
      { sql },
      { createInternalExecutionObjectReadHandler },
      { createDrizzleExecutionStatusReader },
    ] = await Promise.all([
      import('@sim/db'),
      import('drizzle-orm'),
      import('../../../sim/lib/api/server/internal-execution-object-read'),
      import('@/modules/execution/control/infrastructure/drizzle-execution-status-reader'),
    ])

    const workflowId = 'workflow-control-handler'
    const workspaceId = 'workspace-control-handler'
    const executionIds = [
      'execution-handler-completed',
      'execution-handler-missing',
      'execution-handler-failed',
      'execution-handler-unavailable',
    ] as const
    const referenceIds = [
      'lv_abcdefghijkl',
      'lv_bcdefghijklm',
      'lv_cdefghijklmn',
      'lv_defghijklmno',
    ] as const
    const reference = (executionId: string, id: string) => ({
      __simLargeValueRef: true,
      version: 1,
      id,
      kind: 'object',
      size: 4 * 1024 * 1024,
      key: `execution/${workspaceId}/${workflowId}/${executionId}/large-value-${id}.json`,
      executionId,
    })

    await db.execute(
      sql.raw(`create table if not exists workflow_execution_logs (
      id text primary key, workflow_id text, workspace_id text not null,
      execution_id text not null unique, state_snapshot_id text not null,
      deployment_version_id text, level text not null, status text not null,
      trigger text not null, started_at timestamp not null, ended_at timestamp,
      total_duration_ms integer, execution_data jsonb not null default '{}',
      cost jsonb, cost_total decimal, models_used text[], files jsonb,
      created_at timestamp not null default now()
    )`)
    )
    await db.execute(
      sql.raw(`create table if not exists paused_executions (
      id text primary key, workflow_id text not null, execution_id text not null unique,
      execution_snapshot jsonb not null, pause_points jsonb not null,
      total_pause_count integer not null, resumed_count integer not null default 0,
      automatic_resume_retry_count integer not null default 0,
      status text not null default 'paused', metadata jsonb not null default '{}',
      paused_at timestamp not null default now(), updated_at timestamp not null default now(),
      expires_at timestamp, next_resume_at timestamp
    )`)
    )
    await db.execute(
      sql.raw(`delete from paused_executions where execution_id in (
        'execution-handler-completed',
        'execution-handler-missing',
        'execution-handler-failed',
        'execution-handler-unavailable'
      )`)
    )
    await db.execute(
      sql.raw(`delete from workflow_execution_logs where execution_id in (
        'execution-handler-completed',
        'execution-handler-missing',
        'execution-handler-failed',
        'execution-handler-unavailable'
      )`)
    )
    for (const [index, executionId] of executionIds.entries()) {
      const status = executionId === 'execution-handler-failed' ? 'failed' : 'completed'
      const executionData = {
        traceStoreRef: reference(executionId, referenceIds[index] ?? referenceIds[0]),
      }
      await db.execute(sql`
        insert into workflow_execution_logs (
          id, workflow_id, workspace_id, execution_id, state_snapshot_id, level, status,
          trigger, started_at, ended_at, total_duration_ms, execution_data, cost_total
        ) values (
          ${`w6-handler-log-${index}`}, ${workflowId}, ${workspaceId}, ${executionId},
          ${`snapshot-handler-${index}`}, 'info', ${status}, 'api',
          '2026-07-30T00:00:00Z', '2026-07-30T00:00:01Z', 1000,
          ${JSON.stringify(executionData)}::jsonb, 0.01
        )
      `)
    }

    let objectReads = 0
    const largePadding = 'x'.repeat(1_500_000)
    const objectHandler = createInternalExecutionObjectReadHandler({
      internalToken: 'w6-internal-object-token-at-least-32-characters',
      objects: {
        async read(command) {
          objectReads++
          if (command.executionId === 'execution-handler-missing') return null
          if (command.executionId === 'execution-handler-unavailable') {
            throw new Error('object storage unavailable')
          }
          if (command.executionId === 'execution-handler-failed') {
            return {
              error: { message: 'external failure' },
              traceSpans: [
                {
                  blockId: 'root',
                  children: [{ blockId: 'agent', output: { nested: { text: 'failed-output' } } }],
                },
              ],
            }
          }
          return {
            finalOutput: { answer: 84 },
            traceSpans: [
              {
                blockId: 'root',
                children: [{ blockId: 'agent', output: { nested: { text: 'recursive-ok' } } }],
              },
            ],
            largePadding,
          }
        },
      },
    })

    const objectServer = createServer(async (request, response) => {
      try {
        if (request.method !== 'POST' || request.url !== '/api/internal/execution-objects/read') {
          response.statusCode = 404
          response.end()
          return
        }
        const chunks: Buffer[] = []
        for await (const chunk of request) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        }
        const body = Buffer.concat(chunks)
        const fetchRequest = new Request(
          `http://${request.headers.host ?? '127.0.0.1'}${request.url}`,
          {
            method: request.method,
            headers: headersFrom(request),
            body: new Uint8Array(body),
          }
        )
        await sendFetchResponse(await objectHandler(fetchRequest), response)
      } catch {
        response.statusCode = 500
        response.end()
      }
    })

    await new Promise<void>((resolve, reject) => {
      objectServer.once('error', reject)
      objectServer.listen(0, '127.0.0.1', () => {
        objectServer.off('error', reject)
        resolve()
      })
    })

    try {
      const address = objectServer.address() as AddressInfo
      let executionStatusQueries = 0
      const countedDatabase = new Proxy(db, {
        get(target, property, receiver) {
          if (property !== 'select') return Reflect.get(target, property, receiver)
          return (...args: Parameters<typeof db.select>) => {
            executionStatusQueries++
            return target.select(...args)
          }
        },
      })
      const app = createApiApplication({
        executionControl: createExecutionControlModule({
          authentication: authentication(),
          workflowAuthorizer: {
            async authorize() {
              return { allowed: true as const, workspaceId }
            },
          },
          jobs: {
            async read() {
              return null
            },
          },
          executions: createDrizzleExecutionStatusReader({ database: countedDatabase }),
          payloads: createObjectStoreExecutionPayloadMaterializer(
            createHttpExecutionObjectStore({
              baseUrl: `http://127.0.0.1:${address.port}`,
              internalToken: 'w6-internal-object-token-at-least-32-characters',
            })
          ),
          resumePoll: {
            async run(commandId) {
              return {
                contractVersion: EXECUTION_CONTRACTS_VERSION,
                commandId,
                status: 'completed' as const,
                claimedRows: 0,
                dispatched: 0,
                failures: [],
              }
            },
          },
        }),
      })

      const requestStatus = async (executionId: string, query = '') => {
        executionStatusQueries = 0
        objectReads = 0
        const response = await app.handle(
          new Request(
            `http://api.test/api/workflows/${workflowId}/executions/${executionId}${query}`,
            { headers: { cookie: 'session=valid' } }
          )
        )
        const body = await response.json()
        expect(executionStatusQueries).toBe(1)
        return { response, body, objectReads }
      }

      const ordinary = await requestStatus('execution-handler-completed')
      expect(ordinary.response.status).toBe(200)
      expect(ordinary.objectReads).toBe(0)
      expect(ordinary.body).toMatchObject({
        status: 'completed',
        finalOutput: null,
        blockOutputs: null,
      })

      const withOutput = await requestStatus('execution-handler-completed', '?includeOutput=true')
      expect(withOutput.response.status).toBe(200)
      expect(withOutput.objectReads).toBe(1)
      expect(withOutput.body.finalOutput).toEqual({ answer: 84 })

      const withSelectedOutput = await requestStatus(
        'execution-handler-completed',
        '?selectedOutputs=agent.nested.text'
      )
      expect(withSelectedOutput.response.status).toBe(200)
      expect(withSelectedOutput.objectReads).toBe(1)
      expect(withSelectedOutput.body.blockOutputs).toEqual({
        'agent.nested.text': 'recursive-ok',
      })

      const failed = await requestStatus('execution-handler-failed')
      expect(failed.response.status).toBe(200)
      expect(failed.objectReads).toBe(1)
      expect(failed.body.error).toBe('external failure')

      const missing = await requestStatus(
        'execution-handler-missing',
        '?includeOutput=true&selectedOutputs=agent.nested.text'
      )
      expect(missing.response.status).toBe(200)
      expect(missing.objectReads).toBe(1)
      expect(missing.body).toMatchObject({
        finalOutput: null,
        blockOutputs: {},
      })

      const unavailable = await requestStatus(
        'execution-handler-unavailable',
        '?includeOutput=true'
      )
      expect(unavailable.response.status).toBe(503)
      expect(unavailable.objectReads).toBe(1)
      expect(unavailable.body).toMatchObject({
        error: 'Execution payload service unavailable',
      })
    } finally {
      await new Promise<void>((resolve, reject) => {
        objectServer.close((error) => (error ? reject(error) : resolve()))
      })
    }
  })
})

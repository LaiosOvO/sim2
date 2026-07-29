#!/usr/bin/env bun
import { createServer } from 'node:net'
import path from 'node:path'

const root = path.resolve(import.meta.dir, '..', '..')
const workerDirectory = path.join(root, 'apps', 'worker')
const apiDirectory = path.join(root, 'apps', 'api')
const token = 'execution-spine-test-token'

async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  await new Promise<void>((resolve) => server.close(() => resolve()))
  if (!port) throw new Error('Unable to allocate a local test port')
  return port
}

async function run(command: string[], cwd: string): Promise<void> {
  const process = Bun.spawn(command, {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ])
  if (exitCode !== 0) {
    throw new Error(`${command.join(' ')} failed:\n${stderr || stdout}`)
  }
}

async function waitForStatus(url: string, expected: number, headers?: HeadersInit): Promise<void> {
  const deadline = Date.now() + 10_000
  let lastStatus: number | undefined
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(1_000) })
      lastStatus = response.status
      if (response.status === expected) return
    } catch {
      // The process may still be loading its split chunks.
    }
    await Bun.sleep(50)
  }
  throw new Error(`${url} did not return ${expected}; last status ${lastStatus ?? 'unreachable'}`)
}

async function stop(process: ReturnType<typeof Bun.spawn>): Promise<void> {
  if (process.exitCode !== null) return
  process.kill()
  await Promise.race([process.exited, Bun.sleep(5_000)])
  if (process.exitCode === null) process.kill(9)
}

await Promise.all([
  run(['bun', 'run', 'build'], workerDirectory),
  run(['bun', 'run', 'build'], apiDirectory),
])

const [sandboxPort, workerPort, apiPort] = await Promise.all([freePort(), freePort(), freePort()])
const processes: Array<ReturnType<typeof Bun.spawn>> = []

try {
  const sandbox = Bun.spawn(['node', 'dist/index.js', '--role=sandbox'], {
    cwd: workerDirectory,
    env: {
      ...process.env,
      ENABLE_RESTRICTED_TEST_SANDBOX: '1',
      INTERNAL_EXECUTION_TOKEN: token,
      SANDBOX_PORT: String(sandboxPort),
    },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  processes.push(sandbox)
  await waitForStatus(`http://127.0.0.1:${sandboxPort}/internal/ready`, 200)

  const worker = Bun.spawn(['node', 'dist/index.js', '--role=execution'], {
    cwd: workerDirectory,
    env: {
      ...process.env,
      INTERNAL_EXECUTION_TOKEN: token,
      SANDBOX_SERVICE_URL: `http://127.0.0.1:${sandboxPort}`,
      WORKER_PORT: String(workerPort),
    },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  processes.push(worker)
  await waitForStatus(`http://127.0.0.1:${workerPort}/internal/ready`, 200)

  const api = Bun.spawn(['node', 'dist/index.js'], {
    cwd: apiDirectory,
    env: {
      ...process.env,
      API_PORT: String(apiPort),
      INTERNAL_EXECUTION_TOKEN: token,
      WORKER_ADMISSION_URL: `http://127.0.0.1:${workerPort}`,
      DATABASE_URL: '',
      BETTER_AUTH_SECRET: '',
      BETTER_AUTH_URL: '',
      NEXT_PUBLIC_APP_URL: '',
      ENCRYPTION_KEY: '',
    },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  processes.push(api)
  await waitForStatus(`http://127.0.0.1:${apiPort}/internal/live`, 200)

  const executionId = 'execution-spine-1'
  const response = await fetch(`http://127.0.0.1:${apiPort}/internal/execution/jobs`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      contractVersion: 1,
      jobId: 'job-spine-1',
      executionId,
      workspaceId: 'workspace-spine',
      workflowId: 'workflow-spine',
      kind: 'run',
      requestedAt: new Date().toISOString(),
      trace: {
        traceId: 'a'.repeat(32),
        spanId: 'b'.repeat(16),
        traceFlags: '01',
        correlationId: 'spine-check',
      },
      payload: {
        contractVersion: 1,
        type: 'sandbox-test',
        operation: 'echo',
        input: { through: ['api', 'worker', 'sandbox'] },
        policy: {
          contractVersion: 1,
          network: 'deny',
          filesystem: {
            mode: 'ephemeral',
            readOnlyMounts: [],
            writableRoot: '/tmp/job',
          },
          cpuTimeMs: 100,
          memoryMiB: 32,
          wallClockMs: 2_000,
          maxInputBytes: 4_096,
          secrets: {
            mode: 'references-only',
            credentialRefs: [],
          },
        },
      },
    }),
  })
  if (response.status !== 202) {
    throw new Error(`API job admission returned ${response.status}: ${await response.text()}`)
  }

  const eventsUrl = `http://127.0.0.1:${workerPort}/internal/executions/${executionId}/events`
  const deadline = Date.now() + 10_000
  let eventTypes: string[] = []
  while (Date.now() < deadline) {
    const eventsResponse = await fetch(eventsUrl, {
      headers: { authorization: `Bearer ${token}` },
    })
    const body = (await eventsResponse.json()) as { events?: Array<{ type?: string }> }
    eventTypes = body.events?.flatMap((event) => (event.type ? [event.type] : [])) ?? []
    if (eventTypes.at(-1) === 'completed') break
    await Bun.sleep(50)
  }
  if (eventTypes.join(',') !== 'started,completed') {
    throw new Error(`Unexpected execution event sequence: ${eventTypes.join(',')}`)
  }
  console.log('Node execution spine OK: API -> execution Worker -> Sandbox role -> completed')
} finally {
  for (const process of processes.reverse()) await stop(process)
}

#!/usr/bin/env bun
import { createServer } from 'node:net'
import path from 'node:path'

const root = path.resolve(import.meta.dir, '..', '..')
const apiDirectory = path.join(root, 'apps', 'api')

async function availablePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Could not allocate API probe port')
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return address.port
}

async function probe(url: string, timeoutMs: number): Promise<Response> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      return await fetch(url)
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Timed out probing ${url}`)
}

async function main(): Promise<void> {
  const port = await availablePort()
  const child = Bun.spawn(['node', '--import', 'tsx', 'src/index.ts'], {
    cwd: apiDirectory,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      API_PORT: String(port),
      DATABASE_URL: '',
      BETTER_AUTH_SECRET: '',
      BETTER_AUTH_URL: '',
      NEXT_PUBLIC_APP_URL: '',
      ENCRYPTION_KEY: '',
    },
  })

  try {
    const baseUrl = `http://127.0.0.1:${port}`
    const health = await probe(`${baseUrl}/api/health`, 5000)
    const readiness = await fetch(`${baseUrl}/internal/ready`)
    if (health.status !== 200) throw new Error(`Standalone health returned ${health.status}`)
    if (readiness.status !== 503) {
      throw new Error(`Unconfigured standalone readiness returned ${readiness.status}`)
    }
    console.log(
      `Standalone Node API OK: health ${health.status}, unconfigured readiness ${readiness.status}`
    )
  } finally {
    child.kill()
    await child.exited
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(1)
})

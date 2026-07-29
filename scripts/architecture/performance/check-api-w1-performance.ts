#!/usr/bin/env bun
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

interface Metrics {
  schemaVersion: 1
  runtime: string
  status: number
  coldStartMs: number
  rssBytes: number
  rssDeltaBytes: number
  heapUsedBytes: number
}

const root = path.resolve(import.meta.dir, '..', '..', '..')
const probe = path.join(
  root,
  'apps',
  'api',
  'src',
  'bootstrap',
  'performance',
  'cold-start-probe.ts'
)
const baselinePath = path.join(root, 'docs', 'testing', 'api-w1-performance-baseline.json')
const budgets = {
  coldStartMs: 5000,
  rssBytes: 384 * 1024 * 1024,
  heapUsedBytes: 192 * 1024 * 1024,
}

async function main(): Promise<void> {
  const processResult = Bun.spawn(['node', '--import', 'tsx', probe], {
    cwd: path.join(root, 'apps', 'api'),
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL:
        process.env.DATABASE_URL ?? 'postgresql://sim:sim@127.0.0.1:1/sim_cold_start_probe',
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET ?? 'cold-start-probe-secret-32-bytes-minimum',
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? 'http://127.0.0.1:3000',
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? '0'.repeat(64),
    },
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    processResult.exited,
    new Response(processResult.stdout).text(),
    new Response(processResult.stderr).text(),
  ])
  if (exitCode !== 0) throw new Error(`Node cold-start probe failed: ${stderr || stdout}`)
  const metrics = JSON.parse(stdout.trim()) as Metrics
  const failures: string[] = []
  if (metrics.runtime !== 'node') failures.push(`unexpected runtime ${metrics.runtime}`)
  if (metrics.status !== 200) failures.push(`health returned ${metrics.status}`)
  if (metrics.coldStartMs > budgets.coldStartMs) {
    failures.push(`cold start ${metrics.coldStartMs} ms exceeds ${budgets.coldStartMs} ms`)
  }
  if (metrics.rssBytes > budgets.rssBytes) {
    failures.push(`RSS ${metrics.rssBytes} exceeds ${budgets.rssBytes}`)
  }
  if (metrics.heapUsedBytes > budgets.heapUsedBytes) {
    failures.push(`heap ${metrics.heapUsedBytes} exceeds ${budgets.heapUsedBytes}`)
  }
  if (failures.length > 0) {
    console.error('W1 API performance budget violations:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }

  if (process.argv.includes('--write')) {
    await mkdir(path.dirname(baselinePath), { recursive: true })
    await writeFile(
      baselinePath,
      `${JSON.stringify({ measuredAt: new Date().toISOString(), budgets, metrics }, null, 2)}\n`,
      'utf8'
    )
  }
  console.log(
    `W1 API Node cold start OK: ${metrics.coldStartMs} ms, ` +
      `${(metrics.rssBytes / 1024 / 1024).toFixed(1)} MiB RSS`
  )
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(1)
})

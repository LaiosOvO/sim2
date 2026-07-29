#!/usr/bin/env bun
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

const root = path.resolve(import.meta.dir, '..', '..', '..')
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'sim-worker-role-isolation-'))

async function buildAndRead(name: string, entrypoint: string): Promise<string> {
  const outdir = path.join(temporaryRoot, name)
  const result = await Bun.build({
    entrypoints: [path.join(root, entrypoint)],
    outdir,
    target: 'node',
    splitting: true,
    sourcemap: 'none',
  })
  if (!result.success) {
    throw new Error(result.logs.map((log) => log.message).join('\n'))
  }
  const files = (await readdir(outdir)).filter((file) => file.endsWith('.js'))
  return (await Promise.all(files.map((file) => readFile(path.join(outdir, file), 'utf8')))).join(
    '\n'
  )
}

try {
  const sandboxBuild = await buildAndRead(
    'sandbox',
    'apps/worker/src/roles/sandbox/start-sandbox-role.ts'
  )
  const forbiddenSandboxMarkers = [
    'createWorkerRuntimeRegistry',
    'createExecutionJobCoordinator',
    'notion_add_database_row',
    'RuntimeToolRegistry',
    '@larksuiteoapi/node-sdk',
  ]
  const violations = forbiddenSandboxMarkers.filter((marker) => sandboxBuild.includes(marker))
  if (violations.length > 0) {
    throw new Error(`Sandbox role reached execution/provider runtime: ${violations.join(', ')}`)
  }
  const sandboxGzipBytes = gzipSync(sandboxBuild).byteLength
  if (sandboxGzipBytes > 256 * 1024) {
    throw new Error(`Sandbox role is ${sandboxGzipBytes} gzip bytes; budget is 262144`)
  }

  const packageJson = JSON.parse(
    await readFile(path.join(root, 'apps', 'worker', 'package.json'), 'utf8')
  ) as { scripts?: Record<string, string> }
  for (const script of ['start', 'start:sandbox']) {
    if (!packageJson.scripts?.[script]?.startsWith('node ')) {
      throw new Error(`apps/worker ${script} must execute Node directly`)
    }
  }
  console.log(
    `Worker role isolation OK: Sandbox ${sandboxGzipBytes} gzip bytes, ` +
      'execution/provider markers 0, production entries use Node'
  )
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}

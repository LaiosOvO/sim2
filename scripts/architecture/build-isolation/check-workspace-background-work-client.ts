#!/usr/bin/env bun
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

const root = path.resolve(import.meta.dir, '..', '..', '..')
const hookPath = path.join(
  root,
  'apps',
  'sim',
  'ee',
  'workspace-forking',
  'hooks',
  'background-work.ts'
)
const contractPath = path.join(
  root,
  'packages',
  'api-contracts',
  'src',
  'workspace-background-work.ts'
)
const wrapperPath = path.join(
  root,
  'apps',
  'sim',
  'lib',
  'api',
  'contracts',
  'workspace-background-work.ts'
)
const forbiddenMarkers = [
  '@/lib/api/contracts/workspace-fork',
  '@sim/db',
  'drizzle-orm',
  '/executor/',
  '/sandbox/',
  '/registry/',
  'next/server',
  'node:crypto',
]

async function build(entrypoint: string): Promise<string> {
  const result = await Bun.build({
    entrypoints: [entrypoint],
    external: ['@tanstack/react-query', 'zod'],
    minify: true,
    target: 'browser',
    write: false,
  })
  if (!result.success) {
    for (const log of result.logs) console.error(log)
    throw new Error(`Browser build failed for ${path.relative(root, entrypoint)}`)
  }
  return (await Promise.all(result.outputs.map((output) => output.text()))).join('\n')
}

async function main(): Promise<void> {
  const hookSource = await readFile(hookPath, 'utf8')
  const wrapperSource = await readFile(wrapperPath, 'utf8')
  if (
    !hookSource.includes('@/lib/api/contracts/workspace-background-work') ||
    !wrapperSource.includes('@sim/api-contracts/workspace-background-work') ||
    !wrapperSource.includes('defineRouteContract')
  ) {
    throw new Error('Background-work hook does not use the focused typed contract wrapper')
  }
  const sources = `${hookSource}\n${wrapperSource}\n${await readFile(contractPath, 'utf8')}`
  const sourceViolations = forbiddenMarkers.filter((marker) => sources.includes(marker))
  if (sourceViolations.length > 0) {
    throw new Error(`Background-work client source contains ${sourceViolations.join(', ')}`)
  }

  const output = `${await build(hookPath)}\n${await build(wrapperPath)}\n${await build(contractPath)}`
  const outputViolations = forbiddenMarkers.filter((marker) => output.includes(marker))
  if (outputViolations.length > 0) {
    throw new Error(`Background-work client build contains ${outputViolations.join(', ')}`)
  }
  const gzipBytes = gzipSync(output).byteLength
  if (gzipBytes > 16 * 1024) {
    throw new Error(`Background-work client build is ${gzipBytes} gzip bytes`)
  }
  console.log(`Workspace background-work client isolation OK: ${gzipBytes} gzip bytes`)
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(1)
})

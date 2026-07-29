#!/usr/bin/env bun
import path from 'node:path'
import { gzipSync } from 'node:zlib'

const root = path.resolve(import.meta.dir, '..', '..', '..')
const entrypoints = ['environment', 'health', 'status'].map((route) =>
  path.join(root, 'apps', 'sim', 'app', 'api', route, 'route.ts')
)
const forbiddenMarkers = [
  '@sim/db',
  'better-auth',
  'drizzle-orm',
  'decryptSecret',
  'encryptSecret',
  'recordAudit',
  'apps/sim/tools/registry',
  'apps/sim/blocks/registry',
  'apps/sim/executor',
]
const maximumGzipBytes = 32 * 1024

async function main(): Promise<void> {
  const result = await Bun.build({
    entrypoints,
    target: 'node',
    minify: true,
    write: false,
  })
  if (!result.success) {
    for (const log of result.logs) console.error(log)
    throw new Error('W1 Next facade build failed')
  }

  const failures: string[] = []
  let largestGzipBytes = 0
  for (const output of result.outputs) {
    const content = await output.text()
    const gzipBytes = gzipSync(content).byteLength
    largestGzipBytes = Math.max(largestGzipBytes, gzipBytes)
    if (gzipBytes > maximumGzipBytes) {
      failures.push(`${path.basename(output.path)} is ${gzipBytes} gzip bytes`)
    }
    const present = forbiddenMarkers.filter((marker) => content.includes(marker))
    if (present.length > 0) {
      failures.push(`${path.basename(output.path)} contains ${present.join(', ')}`)
    }
  }

  if (failures.length > 0) {
    console.error('W1 Next facade isolation violations:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }
  console.log(
    `W1 Next facade isolation OK: ${result.outputs.length} entries, largest ${largestGzipBytes} gzip bytes`
  )
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(1)
})

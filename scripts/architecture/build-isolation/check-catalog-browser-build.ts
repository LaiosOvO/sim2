#!/usr/bin/env bun
import path from 'node:path'
import { gzipSync } from 'node:zlib'

const root = path.resolve(import.meta.dir, '..', '..', '..')
const entrypoint = path.join(root, 'apps', 'sim', 'lib', 'catalog', 'client.ts')
const maximumGzipBytes = 150 * 1024
const forbiddenMarkers = [
  'isolated-vm',
  'apps/sim/executor',
  'apps/sim/tools/registry',
  'apps/sim/blocks/registry',
  'apps/sim/lib/execution',
  'node:crypto',
  '@larksuiteoapi/node-sdk',
  'zod',
]

async function main(): Promise<void> {
  const result = await Bun.build({
    entrypoints: [entrypoint],
    target: 'browser',
    minify: true,
    write: false,
  })
  if (!result.success || result.outputs.length !== 1) {
    for (const log of result.logs) console.error(log)
    throw new Error(`Expected one successful browser output, received ${result.outputs.length}`)
  }

  const output = result.outputs[0]
  const content = await output.text()
  const gzipBytes = gzipSync(content).byteLength
  const present = forbiddenMarkers.filter((marker) => content.includes(marker))
  const failures: string[] = []
  if (gzipBytes > maximumGzipBytes) {
    failures.push(`catalog client is ${gzipBytes} gzip bytes; budget is ${maximumGzipBytes}`)
  }
  if (present.length > 0) failures.push(`forbidden markers: ${present.join(', ')}`)

  if (failures.length > 0) {
    console.error('Browser catalog build isolation failed:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }

  console.log(
    `Browser catalog build isolation OK: ${output.size} raw / ${gzipBytes} gzip bytes, ` +
      'no runtime leakage'
  )
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(1)
})

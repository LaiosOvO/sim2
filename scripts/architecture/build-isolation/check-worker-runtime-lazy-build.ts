#!/usr/bin/env bun
import path from 'node:path'

const root = path.resolve(import.meta.dir, '..', '..', '..')
const providerMarker = 'runtime-provider:notion:lazy-chunk'

async function main(): Promise<void> {
  const result = await Bun.build({
    entrypoints: [path.join(root, 'apps', 'worker', 'src', 'index.ts')],
    target: 'node',
    splitting: true,
    minify: true,
    write: false,
    naming: {
      entry: '[name].[ext]',
      chunk: 'chunks/[name]-[hash].[ext]',
    },
  })
  if (!result.success) {
    for (const log of result.logs) console.error(log)
    throw new Error('Worker split build failed')
  }

  const outputs = await Promise.all(
    result.outputs.map(async (output) => ({
      kind: output.kind,
      path: output.path,
      content: await output.text(),
    }))
  )
  const entry = outputs.find((output) => output.kind === 'entry-point')
  const providerChunks = outputs.filter((output) => output.content.includes(providerMarker))
  const failures: string[] = []
  if (!entry) failures.push('entry output is missing')
  if (entry?.content.includes(providerMarker)) {
    failures.push('Notion provider implementation was bundled into the Worker startup entry')
  }
  if (providerChunks.length !== 1) {
    failures.push(
      `expected exactly one lazy Notion provider chunk, received ${providerChunks.length}`
    )
  }
  if (outputs.length < 2) failures.push('split build did not emit a lazy provider chunk')

  if (failures.length > 0) {
    console.error('Worker Runtime Registry lazy-build violations:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }

  console.log(
    `Worker Runtime Registry lazy build OK: ${outputs.length} outputs; provider absent from startup entry`
  )
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(1)
})

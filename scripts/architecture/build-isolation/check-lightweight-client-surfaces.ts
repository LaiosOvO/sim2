#!/usr/bin/env bun
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

interface SurfaceBudget {
  id: string
  entrypoint: string
  maxTotalGzipBytes: number
}

interface LightweightSurfaceBaseline {
  schemaVersion: 1
  surfaces: SurfaceBudget[]
  forbiddenInputFragments: string[]
  forbiddenOutputMarkers: string[]
}

const root = path.resolve(import.meta.dir, '..', '..', '..')

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const baselinePath = path.resolve(
  argument('--baseline') ??
    path.join(root, 'docs', 'testing', 'lightweight-client-surface-baseline.json')
)

function normalize(file: string): string {
  return file.replaceAll('\\', '/')
}

async function inspectSurface(
  surface: SurfaceBudget,
  baseline: LightweightSurfaceBaseline
): Promise<string[]> {
  const result = await Bun.build({
    entrypoints: [path.join(root, surface.entrypoint)],
    target: 'browser',
    minify: true,
    metafile: true,
    write: false,
  })
  if (!result.success) {
    return result.logs.map((log) => `${surface.id}: ${String(log)}`)
  }

  const inputs = Object.keys(result.metafile.inputs).map(normalize)
  const forbiddenInputs = baseline.forbiddenInputFragments.filter((fragment) =>
    inputs.some((input) => input.includes(fragment))
  )
  const outputTexts = await Promise.all(result.outputs.map((output) => output.text()))
  const forbiddenMarkers = baseline.forbiddenOutputMarkers.filter((marker) =>
    outputTexts.some((output) => output.includes(marker))
  )
  const totalGzipBytes = result.outputs.reduce((total, output, index) => {
    return total + gzipSync(outputTexts[index]).byteLength
  }, 0)
  const failures: string[] = []
  if (totalGzipBytes > surface.maxTotalGzipBytes) {
    failures.push(
      `${surface.id}: ${totalGzipBytes} gzip bytes exceeds ${surface.maxTotalGzipBytes}`
    )
  }
  if (forbiddenInputs.length > 0) {
    failures.push(`${surface.id}: forbidden inputs ${forbiddenInputs.join(', ')}`)
  }
  if (forbiddenMarkers.length > 0) {
    failures.push(`${surface.id}: forbidden output markers ${forbiddenMarkers.join(', ')}`)
  }

  console.log(
    `${surface.id}: ${totalGzipBytes} gzip bytes, ${inputs.length} inputs, no heavy runtime leakage`
  )
  return failures
}

async function main(): Promise<void> {
  const baseline = JSON.parse(await readFile(baselinePath, 'utf8')) as LightweightSurfaceBaseline
  const failures = (
    await Promise.all(baseline.surfaces.map((surface) => inspectSurface(surface, baseline)))
  ).flat()

  if (failures.length === 0) {
    console.log('Lightweight browser surface ratchet passed')
    return
  }
  console.error('Lightweight browser surface violations:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(1)
})

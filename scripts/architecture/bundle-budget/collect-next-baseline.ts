#!/usr/bin/env bun
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

interface TraceEvent {
  name?: string
  duration?: number
  tags?: Record<string, string>
}

interface ChunkMetric {
  file: string
  rawBytes: number
  gzipBytes: number
}

const repositoryRoot = path.resolve(import.meta.dir, '..', '..', '..')

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function asNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

async function filesUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await filesUnder(absolute)))
    } else if (entry.isFile()) {
      files.push(absolute)
    }
  }
  return files
}

async function collectChunks(nextDirectory: string): Promise<{
  fileCount: number
  rawBytes: number
  gzipBytes: number
  largest: ChunkMetric[]
}> {
  const staticDirectory = path.join(nextDirectory, 'static')
  const chunkFiles = (await filesUnder(staticDirectory)).filter((file) =>
    ['.js', '.css'].includes(path.extname(file))
  )
  const metrics: ChunkMetric[] = []
  for (const file of chunkFiles) {
    const content = await readFile(file)
    metrics.push({
      file: path.relative(nextDirectory, file).replaceAll(path.sep, '/'),
      rawBytes: content.byteLength,
      gzipBytes: gzipSync(content).byteLength,
    })
  }
  return {
    fileCount: metrics.length,
    rawBytes: metrics.reduce((total, metric) => total + metric.rawBytes, 0),
    gzipBytes: metrics.reduce((total, metric) => total + metric.gzipBytes, 0),
    largest: metrics.sort((a, b) => b.gzipBytes - a.gzipBytes).slice(0, 20),
  }
}

async function collectTrace(nextDirectory: string): Promise<object> {
  const tracePath = path.join(nextDirectory, 'trace')
  const traceText = await readFile(tracePath, 'utf8')
  const events = JSON.parse(traceText.trim().replace(/\]\s*\[/g, ',')) as TraceEvent[]
  const compileEvents = events.filter(
    (event): event is TraceEvent & { duration: number } =>
      event.name === 'compile-path' && typeof event.duration === 'number'
  )
  const memoryEvents = events.filter((event) => event.name === 'memory-usage')
  const peak = (key: string): number =>
    memoryEvents.reduce((maximum, event) => Math.max(maximum, asNumber(event.tags?.[key]) ?? 0), 0)

  return {
    traceBytes: (await stat(tracePath)).size,
    eventCount: events.length,
    compilePathCount: compileEvents.length,
    compilePathTotalMs:
      Math.round(compileEvents.reduce((total, event) => total + event.duration, 0) / 100) / 10,
    longestCompilePaths: compileEvents
      .map((event) => ({
        trigger: event.tags?.trigger ?? 'unknown',
        durationMs: Math.round(event.duration / 100) / 10,
      }))
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 20),
    peakRssBytes: peak('memory.rss'),
    peakHeapUsedBytes: peak('memory.heapUsed'),
    memoryThresholdRestarts: events.filter(
      (event) => event.name === 'server-restart-close-to-memory-threshold'
    ).length,
    developmentServerStarts: events.filter((event) => event.name === 'start-dev-server').length,
  }
}

async function main(): Promise<void> {
  const nextDirectory = path.resolve(
    argument('--next-dir') ?? path.join(repositoryRoot, 'apps', 'sim', '.next', 'dev')
  )
  const [trace, chunks] = await Promise.all([
    collectTrace(nextDirectory),
    collectChunks(nextDirectory),
  ])

  console.log(
    JSON.stringify(
      {
        schemaVersion: 1,
        capturedAt: new Date().toISOString(),
        source: {
          nextDirectory,
          mode: path.basename(nextDirectory),
        },
        trace,
        chunks,
      },
      null,
      2
    )
  )
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(1)
})

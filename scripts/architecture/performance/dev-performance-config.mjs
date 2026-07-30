import { readFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

export const repositoryRoot = path.resolve(import.meta.dirname, '..', '..', '..')
export const performanceDirectory = path.join(repositoryRoot, '.perf')
export const journeyStatePath =
  process.env.PERF_JOURNEY_STATE ??
  path.join(performanceDirectory, 'journey', 'controlled-journey.json')
export const storageStatePath =
  process.env.PERF_STORAGE_STATE ?? path.join(performanceDirectory, 'auth', 'storage-state.json')

function positiveInteger(name, fallback) {
  const parsed = Number.parseInt(process.env[name] ?? String(fallback), 10)
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`)
  }
  return parsed
}

export function readJourneyConfig() {
  let journeyState = {}
  try {
    journeyState = JSON.parse(readFileSync(journeyStatePath, 'utf8'))
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw new Error(`Failed to read performance journey state: ${journeyStatePath}`, {
        cause: error,
      })
    }
  }

  const workspaceId = process.env.PERF_WORKSPACE_ID?.trim() || journeyState.workspaceId
  const workflowId = process.env.PERF_WORKFLOW_ID?.trim() || journeyState.workflowId
  if (!workspaceId || !workflowId) {
    throw new Error(
      `PERF_WORKSPACE_ID and PERF_WORKFLOW_ID are required. Set them explicitly or run perf:dev:seed to create ${journeyStatePath}`
    )
  }

  return {
    baseUrl: new URL(process.env.PERF_BASE_URL ?? 'http://127.0.0.1:3000').origin,
    workspaceId,
    workflowId,
    homeReadySelector: process.env.PERF_HOME_READY_SELECTOR ?? 'textarea, [contenteditable="true"]',
    editorReadySelector:
      process.env.PERF_EDITOR_READY_SELECTOR ?? '.react-flow__viewport, [data-reactflow-viewport]',
    warmReloads: positiveInteger('PERF_WARM_RELOADS', 10),
    apiSamples: positiveInteger('PERF_API_SAMPLES', 30),
    rounds: positiveInteger('PERF_ROUNDS', 3),
    modes: (process.env.PERF_MODES ?? 'full,minimal,webpack')
      .split(',')
      .map((mode) => mode.trim())
      .filter(Boolean),
  }
}

export async function ensurePerformanceDirectories() {
  await Promise.all([
    mkdir(path.dirname(storageStatePath), { recursive: true }),
    mkdir(path.dirname(journeyStatePath), { recursive: true }),
    mkdir(path.join(performanceDirectory, 'logs'), { recursive: true }),
    mkdir(path.join(performanceDirectory, 'reports'), { recursive: true }),
  ])
}

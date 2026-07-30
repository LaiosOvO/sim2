import { writeFile } from 'node:fs/promises'
import { request } from 'playwright'
import {
  ensurePerformanceDirectories,
  journeyStatePath,
  storageStatePath,
} from './dev-performance-config.mjs'

const baseUrl = new URL(process.env.PERF_BASE_URL ?? 'http://127.0.0.1:3000').origin
const email = process.env.PERF_EMAIL?.trim()
const password = process.env.PERF_PASSWORD
const name = process.env.PERF_USER_NAME?.trim() || 'Sim2 Performance'

if (!email || !password) {
  throw new Error('PERF_EMAIL and PERF_PASSWORD are required and are never written to disk')
}

async function responseError(response) {
  const body = await response.text()
  return `HTTP ${response.status()}${body ? `: ${body}` : ''}`
}

await ensurePerformanceDirectories()

const health = await fetch(`${baseUrl}/api/health`)
if (!health.ok) {
  throw new Error(`Health check failed with HTTP ${health.status}`)
}

const context = await request.newContext({
  baseURL: baseUrl,
  extraHTTPHeaders: { origin: baseUrl },
})

try {
  let auth = await context.post('/api/auth/sign-in/email', {
    data: { email, password },
    timeout: 120_000,
  })

  if (!auth.ok()) {
    auth = await context.post('/api/auth/sign-up/email', {
      data: { email, password, name },
      timeout: 120_000,
    })
    if (!auth.ok()) {
      throw new Error(
        `Unable to sign in or create the controlled account (${await responseError(auth)})`
      )
    }
    process.stdout.write(`[perf] created controlled account ${email}\n`)
  } else {
    process.stdout.write(`[perf] reused controlled account ${email}\n`)
  }

  const workspacesResponse = await context.get('/api/workspaces', { timeout: 120_000 })
  if (!workspacesResponse.ok()) {
    throw new Error(
      `Unable to list controlled workspaces (${await responseError(workspacesResponse)})`
    )
  }
  const workspacePayload = await workspacesResponse.json()
  const workspace = workspacePayload.workspaces?.[0]
  if (!workspace?.id) {
    throw new Error('The controlled account did not produce a workspace')
  }

  const workflowsResponse = await context.get(
    `/api/workflows?workspaceId=${encodeURIComponent(workspace.id)}`,
    { timeout: 120_000 }
  )
  if (!workflowsResponse.ok()) {
    throw new Error(
      `Unable to list controlled workflows (${await responseError(workflowsResponse)})`
    )
  }
  const workflowPayload = await workflowsResponse.json()
  let workflow = workflowPayload.data?.[0]

  if (!workflow?.id) {
    const createResponse = await context.post('/api/workflows', {
      data: {
        name: 'performance-agent',
        description: 'Controlled Node 22 development performance journey',
        workspaceId: workspace.id,
        deduplicate: true,
      },
      timeout: 120_000,
    })
    if (!createResponse.ok()) {
      throw new Error(
        `Unable to create controlled workflow (${await responseError(createResponse)})`
      )
    }
    workflow = await createResponse.json()
  }

  const state = {
    schemaVersion: 1,
    baseUrl,
    workspaceId: workspace.id,
    workflowId: workflow.id,
    workspaceName: workspace.name,
    workflowName: workflow.name,
  }
  await writeFile(journeyStatePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  await context.storageState({ path: storageStatePath })

  process.stdout.write(`[perf] journey state saved to ${journeyStatePath}\n`)
  process.stdout.write(`[perf] browser storage state saved to ${storageStatePath}\n`)
  process.stdout.write(`[perf] workspace=${workspace.id} workflow=${workflow.id}\n`)
} finally {
  await context.dispose()
}

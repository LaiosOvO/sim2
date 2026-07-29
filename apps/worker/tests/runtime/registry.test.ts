import type { ExecutionJobV1 } from '@sim/execution-contracts'
import { describe, expect, it, vi } from 'vitest'
import { createWorkerApplication } from '@/bootstrap/application/create-worker-application'
import type { NotionTransport } from '@/runtime/providers/notion/provider'
import type { RuntimeCredentialResolver, RuntimeProviderLoader } from '@/runtime/registry'
import { createRuntimeToolRegistry, RUNTIME_TOOL_DECLARATIONS } from '@/runtime/registry'

function job(payload: Record<string, unknown>): ExecutionJobV1 {
  return {
    contractVersion: 1,
    jobId: 'job-1',
    executionId: 'execution-1',
    workspaceId: 'workspace-1',
    workflowId: 'workflow-1',
    kind: 'run',
    requestedAt: '2026-07-30T00:00:00.000Z',
    trace: {
      traceId: 'a'.repeat(32),
      spanId: 'b'.repeat(16),
      traceFlags: '01',
      correlationId: 'request-1',
    },
    payload,
  }
}

function credentialResolver(): RuntimeCredentialResolver {
  return {
    resolve: vi.fn(async () => ({
      type: 'bearer' as const,
      token: 'worker-only-token',
    })),
  }
}

function notionLoader(
  transport: NotionTransport,
  loaded: { count: number }
): RuntimeProviderLoader {
  return async () => {
    loaded.count += 1
    const provider = await import('@/runtime/providers/notion/provider')
    return provider.createNotionRuntimeProvider(transport)
  }
}

describe('Worker-only runtime registry', () => {
  it('executes a historical tool ID from a job through the lazy provider adapter', async () => {
    const loaded = { count: 0 }
    const credentials = credentialResolver()
    const transport: NotionTransport = {
      addDatabaseRow: vi.fn(async ({ accessToken, databaseId, properties }) => {
        expect(accessToken).toBe('worker-only-token')
        expect(databaseId).toBe('database-1')
        expect(properties).toEqual({ Name: { title: [] } })
        return {
          id: 'page-1',
          url: 'https://notion.so/page-1',
          title: 'Task 1',
          createdTime: '2026-07-30T00:00:01.000Z',
          lastEditedTime: '2026-07-30T00:00:01.000Z',
        }
      }),
    }
    const registry = createRuntimeToolRegistry({
      declarations: RUNTIME_TOOL_DECLARATIONS,
      providerLoaders: { notion: notionLoader(transport, loaded) },
      credentials,
    })
    const application = createWorkerApplication({ runtimeRegistry: registry })

    expect(registry.loadedProviderIds()).toEqual([])
    expect(loaded.count).toBe(0)

    await application.start()
    const result = await application.executeToolJob(
      job({
        contractVersion: 1,
        toolId: 'notion_add_database_row',
        credentialRef: 'credential-1',
        params: {
          databaseId: ' database-1 ',
          properties: { Name: { title: [] } },
        },
      })
    )
    await application.stop()

    expect(result).toEqual({
      contractVersion: 1,
      ok: true,
      requestedToolId: 'notion_add_database_row',
      toolId: 'notion_add_database_row_v2',
      providerId: 'notion',
      output: {
        id: 'page-1',
        url: 'https://notion.so/page-1',
        title: 'Task 1',
        created_time: '2026-07-30T00:00:01.000Z',
        last_edited_time: '2026-07-30T00:00:01.000Z',
      },
    })
    expect(loaded.count).toBe(1)
    expect(registry.loadedProviderIds()).toEqual(['notion'])
    expect(credentials.resolve).toHaveBeenCalledWith({
      providerId: 'notion',
      workspaceId: 'workspace-1',
      credentialRef: 'credential-1',
    })
  })

  it('does not load a provider for an unknown tool', async () => {
    const loaded = { count: 0 }
    const registry = createRuntimeToolRegistry({
      declarations: RUNTIME_TOOL_DECLARATIONS,
      providerLoaders: {
        notion: notionLoader(
          {
            addDatabaseRow: vi.fn(),
          },
          loaded
        ),
      },
      credentials: credentialResolver(),
    })

    const result = await registry.execute({
      toolId: 'missing_tool',
      params: {},
      context: {
        jobId: 'job-1',
        executionId: 'execution-1',
        workspaceId: 'workspace-1',
        workflowId: 'workflow-1',
      },
    })

    expect(result).toMatchObject({
      contractVersion: 1,
      ok: false,
      error: {
        contractVersion: 1,
        code: 'RUNTIME_TOOL_NOT_FOUND',
        requestedToolId: 'missing_tool',
      },
    })
    expect(loaded.count).toBe(0)
  })

  it('returns a versioned missing-provider error', async () => {
    const registry = createRuntimeToolRegistry({
      declarations: RUNTIME_TOOL_DECLARATIONS,
      providerLoaders: {},
      credentials: credentialResolver(),
    })

    const result = await registry.execute({
      toolId: 'notion_add_database_row_v2',
      params: {},
      context: {
        jobId: 'job-1',
        executionId: 'execution-1',
        workspaceId: 'workspace-1',
        workflowId: 'workflow-1',
      },
    })

    expect(result).toMatchObject({
      contractVersion: 1,
      ok: false,
      error: {
        contractVersion: 1,
        code: 'RUNTIME_PROVIDER_NOT_FOUND',
        requestedToolId: 'notion_add_database_row_v2',
        providerId: 'notion',
      },
    })
  })

  it('returns a versioned parameter-validation error from the provider adapter', async () => {
    const loaded = { count: 0 }
    const registry = createRuntimeToolRegistry({
      declarations: RUNTIME_TOOL_DECLARATIONS,
      providerLoaders: {
        notion: notionLoader(
          {
            addDatabaseRow: vi.fn(),
          },
          loaded
        ),
      },
      credentials: credentialResolver(),
    })

    const result = await registry.execute({
      toolId: 'notion_add_database_row_v2',
      params: { databaseId: '', properties: [] },
      context: {
        jobId: 'job-1',
        executionId: 'execution-1',
        workspaceId: 'workspace-1',
        workflowId: 'workflow-1',
      },
    })

    expect(result).toMatchObject({
      contractVersion: 1,
      ok: false,
      error: {
        contractVersion: 1,
        code: 'RUNTIME_TOOL_INPUT_INVALID',
        requestedToolId: 'notion_add_database_row_v2',
        providerId: 'notion',
      },
    })
    expect(loaded.count).toBe(1)
  })

  it('rejects an invalid invocation payload before provider loading', async () => {
    const loaded = { count: 0 }
    const registry = createRuntimeToolRegistry({
      declarations: RUNTIME_TOOL_DECLARATIONS,
      providerLoaders: {
        notion: notionLoader(
          {
            addDatabaseRow: vi.fn(),
          },
          loaded
        ),
      },
      credentials: credentialResolver(),
    })
    const application = createWorkerApplication({ runtimeRegistry: registry })

    const result = await application.executeToolJob(
      job({
        contractVersion: 1,
        toolId: 'notion_add_database_row_v2',
      })
    )

    expect(result).toMatchObject({
      contractVersion: 1,
      ok: false,
      error: {
        contractVersion: 1,
        code: 'RUNTIME_JOB_PAYLOAD_INVALID',
        requestedToolId: 'notion_add_database_row_v2',
      },
    })
    expect(loaded.count).toBe(0)
  })
})

/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadEditorWorkflow, saveEditorWorkflow } from './editor-api'

describe('workspace Vite editor API', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('normalizes the workflow envelope without importing the Next editor', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          data: {
            id: 'workflow-1',
            workspaceId: 'workspace-1',
            name: 'Workflow',
            description: null,
            isDeployed: false,
            locked: false,
            state: {
              blocks: {
                first: {
                  id: 'first',
                  type: 'starter',
                  name: 'Start',
                  position: { x: 20, y: 40 },
                  subBlocks: {},
                  outputs: {},
                  enabled: true,
                  triggerMode: 'manual',
                  data: { width: 320, nestedEditorState: { keep: true } },
                },
              },
              edges: [
                {
                  id: 'edge-1',
                  source: 'first',
                  target: 'second',
                  markerEnd: { type: 'arrowclosed' },
                },
              ],
              loops: {},
              parallels: {},
            },
          },
        })
      )
    )

    const workflow = await loadEditorWorkflow('workflow-1')
    expect(workflow.state.blocks.first.position).toEqual({ x: 20, y: 40 })
    expect(workflow.state.blocks.first.triggerMode).toBe('manual')
    expect(workflow.state.blocks.first.data).toEqual({
      width: 320,
      nestedEditorState: { keep: true },
    })
    expect(workflow.state.edges[0]?.markerEnd).toEqual({ type: 'arrowclosed' })
  })

  it('saves the complete normalized state through the existing workflow contract', async () => {
    const fetchMock = vi.fn(async (_input: string, _init?: RequestInit) =>
      Response.json({ success: true, warnings: [] })
    )
    vi.stubGlobal('fetch', fetchMock)

    await saveEditorWorkflow({
      id: 'workflow-1',
      workspaceId: 'workspace-1',
      name: 'Workflow',
      description: null,
      isDeployed: false,
      locked: false,
      state: { blocks: {}, edges: [], loops: {}, parallels: {}, variables: {} },
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/workflows/workflow-1/state',
      expect.objectContaining({ method: 'PUT', credentials: 'include' })
    )
    const options = fetchMock.mock.calls[0]?.[1]
    expect(JSON.parse(String(options?.body))).toEqual(
      expect.objectContaining({
        blocks: {},
        edges: [],
        loops: {},
        parallels: {},
        variables: {},
      })
    )
  })
})

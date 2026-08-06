/**
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest'
import type { EditorWorkflow } from './editor-api'
import {
  applyEditorRemoteOperation,
  buildEditorOperations,
  rebaseEditorHistory,
  rebaseEditorHistoryToWorkflow,
} from './editor-operations'

function workflow(): EditorWorkflow {
  return {
    id: 'workflow-one',
    name: 'Workflow',
    description: null,
    isDeployed: false,
    workspaceId: 'workspace-one',
    locked: false,
    state: {
      blocks: {
        one: {
          id: 'one',
          type: 'starter',
          name: 'Starter',
          position: { x: 10, y: 20 },
          subBlocks: { prompt: { id: 'prompt', type: 'long-input', value: 'old' } },
          outputs: {},
          enabled: true,
          data: {},
        },
      },
      edges: [],
      loops: {},
      parallels: {},
    },
  }
}

describe('workspace Vite realtime editor operations', () => {
  it('emits narrow position, name and conflict-aware field updates', () => {
    const before = workflow()
    const after = structuredClone(before)
    after.state.blocks.one.position = { x: 30, y: 40 }
    after.state.blocks.one.name = 'Renamed'
    after.state.blocks.one.subBlocks.prompt = {
      id: 'prompt',
      type: 'long-input',
      value: 'new',
    }

    const operations = buildEditorOperations(before, after)
    expect(operations.map((entry) => entry.operation)).toEqual([
      'update-position',
      'update-name',
      'subblock-batch-update',
    ])
    expect(operations[2].payload).toEqual({
      updates: [{ blockId: 'one', subblockId: 'prompt', value: 'new', expectedValue: 'old' }],
    })
  })

  it('emits batch operations for graph additions and removals', () => {
    const before = workflow()
    before.state.edges = [{ id: 'old-edge', source: 'one', target: 'removed' }]
    before.state.blocks.removed = {
      ...before.state.blocks.one,
      id: 'removed',
      name: 'Removed',
    }
    const after = workflow()
    after.state.blocks.added = { ...after.state.blocks.one, id: 'added', name: 'Added' }
    after.state.edges = [{ id: 'new-edge', source: 'one', target: 'added' }]

    expect(buildEditorOperations(before, after).map((entry) => entry.operation)).toEqual([
      'batch-add-blocks',
      'batch-remove-blocks',
      'batch-remove-edges',
      'batch-add-edges',
    ])
  })

  it('emits a narrow subflow update for a container configuration change', () => {
    const before = workflow()
    before.state.loops = { loop: { id: 'loop', iterations: 2, loopType: 'for' } }
    before.state.blocks.loop = { ...before.state.blocks.one, id: 'loop', type: 'loop' }
    const after = structuredClone(before)
    after.state.loops = { loop: { id: 'loop', iterations: 5, loopType: 'for' } }

    const updates = buildEditorOperations(before, after)
    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatchObject({
      operation: 'update',
      target: 'subflow',
      payload: { id: 'loop', type: 'loop', config: { iterations: 5 } },
    })
  })

  it('applies remote edits and their inverse undo operations without a full reload', () => {
    const updated = applyEditorRemoteOperation(workflow(), {
      operation: 'subblock-batch-update',
      target: 'subblock',
      payload: {
        updates: [{ blockId: 'one', subblockId: 'prompt', expectedValue: 'old', value: 'remote' }],
      },
    })
    expect(updated.status).toBe('applied')
    if (updated.status !== 'applied') return
    expect(updated.workflow.state.blocks.one.subBlocks.prompt).toMatchObject({ value: 'remote' })

    const undone = applyEditorRemoteOperation(updated.workflow, {
      operation: 'subblock-batch-update',
      target: 'subblock',
      payload: {
        updates: [{ blockId: 'one', subblockId: 'prompt', expectedValue: 'remote', value: 'old' }],
      },
    })
    expect(undone.status).toBe('applied')
    if (undone.status === 'applied') {
      expect(undone.workflow.state.blocks.one.subBlocks.prompt).toMatchObject({ value: 'old' })
    }
  })

  it('surfaces expected-value conflicts instead of overwriting a newer snapshot', () => {
    expect(
      applyEditorRemoteOperation(workflow(), {
        operation: 'subblock-batch-update',
        target: 'subblock',
        payload: {
          updates: [
            { blockId: 'one', subblockId: 'prompt', expectedValue: 'stale', value: 'remote' },
          ],
        },
      })
    ).toEqual({ status: 'conflict' })
  })

  it('applies remote graph additions and removals', () => {
    const added = applyEditorRemoteOperation(workflow(), {
      operation: 'batch-add-blocks',
      target: 'blocks',
      payload: {
        blocks: [
          {
            ...workflow().state.blocks.one,
            id: 'two',
            name: 'Second',
          },
        ],
      },
    })
    expect(added.status).toBe('applied')
    if (added.status !== 'applied') return
    const withEdge = applyEditorRemoteOperation(added.workflow, {
      operation: 'batch-add-edges',
      target: 'edges',
      payload: { edges: [{ id: 'edge-1', source: 'one', target: 'two' }] },
    })
    expect(withEdge.status).toBe('applied')
    if (withEdge.status !== 'applied') return
    expect(withEdge.workflow.state.edges).toHaveLength(1)
    const removed = applyEditorRemoteOperation(withEdge.workflow, {
      operation: 'batch-remove-blocks',
      target: 'blocks',
      payload: { ids: ['two'] },
    })
    expect(removed.status).toBe('applied')
    if (removed.status === 'applied') expect(removed.workflow.state.edges).toEqual([])
  })

  it('rebases a collaborator edit across local history instead of clearing the stack', () => {
    const beforeLocalRename = workflow()
    const current = structuredClone(beforeLocalRename)
    current.state.blocks.one.name = 'My rename'
    const remote = {
      operation: 'subblock-batch-update',
      target: 'subblock',
      payload: {
        updates: [{ blockId: 'one', subblockId: 'prompt', expectedValue: 'old', value: 'remote' }],
      },
    }
    const applied = applyEditorRemoteOperation(current, remote)
    expect(applied.status).toBe('applied')
    if (applied.status !== 'applied') return

    const history = rebaseEditorHistory([beforeLocalRename], applied.workflow, remote)

    expect(history).toHaveLength(1)
    expect(history[0].state.blocks.one.name).toBe('Starter')
    expect(history[0].state.blocks.one.subBlocks.prompt).toMatchObject({ value: 'remote' })
  })

  it('prunes a history step that a collaborator has already superseded', () => {
    const beforeLocalRename = workflow()
    const current = structuredClone(beforeLocalRename)
    current.state.blocks.one.name = 'My rename'
    const loaded = structuredClone(current)
    loaded.state.blocks.one.name = 'Remote rename'

    expect(rebaseEditorHistoryToWorkflow([beforeLocalRename], current, loaded)).toEqual([])
  })
})

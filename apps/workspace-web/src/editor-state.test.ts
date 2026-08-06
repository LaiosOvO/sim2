/**
 * @vitest-environment node
 */

import type { EditorBlockTemplateV1 } from '@sim/tool-catalog'
import { describe, expect, it } from 'vitest'
import type { EditorBlock, EditorWorkflow } from './editor-api'
import {
  addEditorBlock,
  addEditorContainer,
  connectEditorBlocks,
  editorBlockPosition,
  removeEditorBlock,
  removeEditorEdge,
  setEditorBlockParent,
  updateEditorBlock,
  updateEditorContainer,
  updateEditorSubBlockValue,
} from './editor-state'

function block(id: string, name: string, extra: Partial<EditorBlock> = {}): EditorBlock {
  return {
    id,
    name,
    type: 'function',
    position: { x: 0, y: 0 },
    subBlocks: {},
    outputs: {},
    enabled: true,
    ...extra,
  }
}

function workflow(): EditorWorkflow {
  return {
    id: 'workflow-1',
    workspaceId: 'workspace-1',
    name: 'Workflow',
    description: null,
    isDeployed: false,
    locked: false,
    state: {
      blocks: {
        first: block('first', 'First', { customState: { keep: true } }),
        second: block('second', 'Second'),
        third: block('third', 'Third'),
      },
      edges: [{ id: 'edge-1', source: 'first', target: 'second', markerEnd: 'keep' }],
      loops: {},
      parallels: {},
      variables: {},
    },
  }
}

const apiTemplate = {
  catalogVersion: 1,
  type: 'api',
  name: 'API',
  kind: 'action',
  singleInstance: false,
  fields: [
    {
      id: 'url',
      title: 'URL',
      type: 'short-input',
      required: true,
      mode: 'basic',
      initialValue: null,
    },
    {
      id: 'headers',
      title: 'Headers',
      type: 'table',
      required: false,
      mode: 'basic',
      initialValue: [],
    },
  ],
  outputs: { data: { type: 'json' } },
  canonicalModes: {},
} satisfies EditorBlockTemplateV1

describe('workspace Vite editor state', () => {
  it('creates a canonical block template and edits values without dropping field metadata', () => {
    const created = addEditorBlock(workflow(), apiTemplate, 'api-new', { x: 400, y: 200 })
    expect(created.state.blocks['api-new']).toEqual(
      expect.objectContaining({
        id: 'api-new',
        type: 'api',
        name: 'API 1',
        position: { x: 400, y: 200 },
        outputs: { data: { type: 'json' } },
      })
    )
    expect(created.state.blocks['api-new'].subBlocks.headers).toEqual({
      id: 'headers',
      type: 'table',
      value: [],
    })

    const configured = updateEditorSubBlockValue(created, 'api-new', 'url', 'https://example.com')
    expect(configured.state.blocks['api-new'].subBlocks.url).toEqual({
      id: 'url',
      type: 'short-input',
      value: 'https://example.com',
    })
    expect(() => updateEditorSubBlockValue(configured, 'api-new', 'missing', 'value')).toThrow(
      'no longer exists'
    )
  })

  it('materializes a fresh ID for each input-format field created from a template', () => {
    const template = {
      ...apiTemplate,
      type: 'starter',
      name: 'Starter',
      fields: [
        {
          id: 'inputFormat',
          title: 'Input Format',
          type: 'input-format',
          required: false,
          mode: 'advanced',
          initialValue: [
            { id: '__GENERATE_ID__', name: '', type: 'string', value: '', collapsed: false },
          ],
        },
      ],
    } satisfies EditorBlockTemplateV1
    const first = addEditorBlock(workflow(), template, 'starter-one', { x: 0, y: 0 })
    const second = addEditorBlock(workflow(), template, 'starter-two', { x: 0, y: 0 })
    const firstValue = (
      first.state.blocks['starter-one'].subBlocks.inputFormat as { value: unknown }
    ).value
    const secondValue = (
      second.state.blocks['starter-two'].subBlocks.inputFormat as { value: unknown }
    ).value
    expect(firstValue).not.toEqual(secondValue)
    expect(firstValue).toEqual([
      expect.objectContaining({ id: expect.stringMatching(/^[0-9a-f-]{36}$/) }),
    ])
  })

  it('keeps Start trigger outputs synchronized with input fields and run metadata', () => {
    const template = {
      ...apiTemplate,
      type: 'start_trigger',
      name: 'Start',
      kind: 'trigger',
      fields: [
        {
          id: 'inputFormat',
          title: 'Inputs',
          type: 'input-format',
          required: false,
          mode: 'basic',
          initialValue: [],
        },
        {
          id: 'runMetadata',
          title: 'Run metadata',
          type: 'switch',
          required: false,
          mode: 'advanced',
          initialValue: false,
        },
      ],
      outputs: {
        input: { type: 'string' },
        conversationId: { type: 'string' },
        files: { type: 'file[]' },
      },
    } satisfies EditorBlockTemplateV1
    const created = addEditorBlock(workflow(), template, 'start', { x: 0, y: 0 })
    const withInput = updateEditorSubBlockValue(created, 'start', 'inputFormat', [
      { id: 'field-1', name: 'customerId', type: 'string', value: '' },
    ])
    const withMetadata = updateEditorSubBlockValue(withInput, 'start', 'runMetadata', true)
    expect(withMetadata.state.blocks.start.outputs).toMatchObject({
      input: { type: 'string' },
      customerId: { type: 'string' },
      metadata: { type: 'json' },
    })
  })

  it('updates safe properties without dropping unknown block fields', () => {
    const current = workflow()
    current.state.blocks.second.subBlocks = {
      expression: {
        nested: ['<first.output>', { template: 'value: <first.result>' }],
      },
    }
    const updated = updateEditorBlock(current, 'first', {
      name: 'Renamed block',
      enabled: false,
    })
    expect(updated.state.blocks.first).toEqual(
      expect.objectContaining({
        name: 'Renamed block',
        enabled: false,
        customState: { keep: true },
      })
    )
    expect(updated.state.blocks.second.subBlocks).toEqual({
      expression: {
        nested: ['<renamedblock.output>', { template: 'value: <renamedblock.result>' }],
      },
    })
    expect(() => updateEditorBlock(updated, 'second', { name: 'renamed.block' })).toThrow(
      'already named'
    )
    expect(() => updateEditorBlock(updated, 'second', { name: 'loop' })).toThrow('reserved')
  })

  it('removes a block, its connections, and matching container state', () => {
    const current = workflow()
    current.state.loops = { second: { keep: false } }
    const updated = removeEditorBlock(current, 'second')
    expect(updated.state.blocks.second).toBeUndefined()
    expect(updated.state.edges).toEqual([])
    expect(updated.state.loops).toEqual({})
  })

  it('creates and configures Loop and Parallel containers using the persisted execution shape', () => {
    const withLoop = addEditorContainer(workflow(), 'loop', 'loop-1', { x: 100, y: 120 })
    const configuredLoop = updateEditorContainer(withLoop, 'loop-1', {
      loopType: 'while',
      whileCondition: '<first.output>',
    })
    expect(configuredLoop.state.blocks['loop-1']).toMatchObject({
      type: 'loop',
      name: 'Loop 1',
      data: { width: 500, height: 300, loopType: 'while' },
    })
    expect(configuredLoop.state.loops?.['loop-1']).toMatchObject({
      id: 'loop-1',
      iterations: 5,
      loopType: 'while',
      whileCondition: '<first.output>',
      nodes: [],
    })

    const withParallel = addEditorContainer(configuredLoop, 'parallel', 'parallel-1', {
      x: 700,
      y: 120,
    })
    const configuredParallel = updateEditorContainer(withParallel, 'parallel-1', {
      parallelType: 'collection',
      collection: '<first.items>',
      batchSize: 10,
    })
    expect(configuredParallel.state.parallels?.['parallel-1']).toMatchObject({
      id: 'parallel-1',
      distribution: '<first.items>',
      parallelType: 'collection',
      batchSize: 10,
      nodes: [],
    })
  })

  it('moves blocks into and out of containers without changing their canvas position', () => {
    const withLoop = addEditorContainer(workflow(), 'loop', 'loop-1', { x: 100, y: 100 })
    withLoop.state.blocks.first.position = { x: 280, y: 240 }
    const nested = setEditorBlockParent(withLoop, 'first', 'loop-1')
    expect(nested.state.blocks.first).toMatchObject({
      position: { x: 180, y: 140 },
      data: { parentId: 'loop-1', extent: 'parent' },
    })
    expect(nested.state.loops?.['loop-1']).toMatchObject({ nodes: ['first'] })
    expect(editorBlockPosition(nested, 'first')).toEqual({ x: 280, y: 240 })

    const detached = setEditorBlockParent(nested, 'first', null)
    expect(detached.state.blocks.first.position).toEqual({ x: 280, y: 240 })
    expect(detached.state.blocks.first.data).not.toHaveProperty('parentId')
    expect(detached.state.loops?.['loop-1']).toMatchObject({ nodes: [] })
  })

  it('does not remove a container while it still owns child blocks', () => {
    const current = workflow()
    current.state.blocks.third = block('third', 'Third', { data: { parentId: 'first' } })
    expect(() => removeEditorBlock(current, 'first')).toThrow('Remove child block')
  })

  it('adds only acyclic, non-duplicate connections and removes by stable edge id', () => {
    const connected = connectEditorBlocks(workflow(), 'second', 'third', 'edge-2')
    expect(connected.state.edges.at(-1)).toEqual({
      id: 'edge-2',
      source: 'second',
      target: 'third',
    })
    expect(() => connectEditorBlocks(connected, 'third', 'first', 'edge-3')).toThrow(
      'create a cycle'
    )
    expect(removeEditorEdge(connected, 'edge-1').state.edges).toHaveLength(1)
  })

  it('does not mutate a locked block or its connections', () => {
    const current = workflow()
    current.state.blocks.first.locked = true
    expect(() => updateEditorBlock(current, 'first', { enabled: false })).toThrow('locked')
    expect(() => removeEditorEdge(current, 'edge-1')).toThrow('locked block connection')
    expect(() => connectEditorBlocks(current, 'first', 'third', 'edge-2')).toThrow('locked')
  })
})

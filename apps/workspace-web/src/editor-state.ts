import type { EditorBlockTemplateV1, EditorTemplateJsonValue } from '@sim/tool-catalog'
import { generateId } from '@sim/utils/id'
import type { EditorBlock, EditorWorkflow } from './editor-api'

interface BlockPatch {
  enabled?: boolean
  name?: string
}

export type EditorContainerKind = 'loop' | 'parallel'

export interface EditorContainerPatch {
  batchSize?: number
  collection?: string
  count?: number
  doWhileCondition?: string
  loopType?: 'for' | 'forEach' | 'while' | 'doWhile'
  parallelType?: 'count' | 'collection'
  whileCondition?: string
}

const RESERVED_BLOCK_NAMES = new Set(['loop', 'parallel', 'variable'])
const GENERATED_ID_SENTINEL = '__GENERATE_ID__'
const E2B_MODE_SENTINEL = '__E2B_MODE__'
const LOCAL_TIMEZONE_SENTINEL = '__LOCAL_TIMEZONE__'

function e2bEnabled(): boolean {
  return ['1', 'true', 'yes', 'on'].includes(
    (import.meta.env.VITE_E2B_ENABLED ?? '').trim().toLowerCase()
  )
}

function materializeInitialValue(value: EditorTemplateJsonValue): EditorTemplateJsonValue {
  if (value === GENERATED_ID_SENTINEL) return generateId()
  if (value === E2B_MODE_SENTINEL) return e2bEnabled() ? 'cloud' : 'local'
  if (value === LOCAL_TIMEZONE_SENTINEL) {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  }
  if (Array.isArray(value)) return value.map(materializeInitialValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, materializeInitialValue(item)])
  )
}

function normalizeBlockName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '').replace(/\./g, '')
}

function replaceReference(value: unknown, oldPrefix: string, newPrefix: string): unknown {
  if (typeof value === 'string') return value.replaceAll(oldPrefix, newPrefix)
  if (Array.isArray(value)) {
    const updated = value.map((item) => replaceReference(item, oldPrefix, newPrefix))
    return updated.some((item, index) => item !== value[index]) ? updated : value
  }
  if (value === null || typeof value !== 'object') return value

  const current = value as Record<string, unknown>
  let changed = false
  const updated = Object.fromEntries(
    Object.entries(current).map(([key, item]) => {
      const replacement = replaceReference(item, oldPrefix, newPrefix)
      changed ||= replacement !== item
      return [key, replacement]
    })
  )
  return changed ? updated : value
}

function editableBlock(workflow: EditorWorkflow, blockId: string): EditorBlock {
  if (workflow.locked) throw new Error('This workflow is read only')
  const block = workflow.state.blocks[blockId]
  if (!block) throw new Error('The selected block no longer exists')
  if (block.locked === true) throw new Error('This block is locked')
  return block
}

function parentId(block: EditorBlock): string | null {
  if (typeof block.parentId === 'string') return block.parentId
  return block.data && typeof block.data.parentId === 'string' ? block.data.parentId : null
}

function synchronizedContainerState(
  workflow: EditorWorkflow,
  blocks: Record<string, EditorBlock>
): Pick<EditorWorkflow['state'], 'loops' | 'parallels'> {
  const loops: Record<string, unknown> = {}
  const parallels: Record<string, unknown> = {}

  for (const block of Object.values(blocks)) {
    const nodes = Object.values(blocks)
      .filter((candidate) => parentId(candidate) === block.id)
      .map((candidate) => candidate.id)
    if (block.type === 'loop') {
      const current = workflow.state.loops?.[block.id]
      loops[block.id] = {
        ...(current && typeof current === 'object' ? current : {}),
        id: block.id,
        nodes,
        iterations: typeof block.data?.count === 'number' ? block.data.count : 5,
        loopType: block.data?.loopType ?? 'for',
        forEachItems: block.data?.collection ?? '',
        whileCondition: block.data?.whileCondition ?? '',
        doWhileCondition: block.data?.doWhileCondition ?? '',
        enabled: block.enabled,
      }
    }
    if (block.type === 'parallel') {
      const current = workflow.state.parallels?.[block.id]
      parallels[block.id] = {
        ...(current && typeof current === 'object' ? current : {}),
        id: block.id,
        nodes,
        count: typeof block.data?.count === 'number' ? block.data.count : 5,
        parallelType: block.data?.parallelType ?? 'count',
        batchSize: typeof block.data?.batchSize === 'number' ? block.data.batchSize : 20,
        distribution: block.data?.collection ?? '',
        enabled: block.enabled,
      }
    }
  }

  return { loops, parallels }
}

export function editorBlockPosition(
  workflow: EditorWorkflow,
  blockId: string
): { x: number; y: number } {
  const visited = new Set<string>()
  let current: EditorBlock | undefined = workflow.state.blocks[blockId]
  let x = 0
  let y = 0
  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    x += current.position.x
    y += current.position.y
    const owner = parentId(current)
    current = owner ? workflow.state.blocks[owner] : undefined
  }
  return { x, y }
}

function uniqueBlockName(workflow: EditorWorkflow, baseName: string): string {
  const normalizedBase = normalizeBlockName(baseName)
  if (normalizedBase === 'start' || normalizedBase === 'starter') return 'Start'
  if (normalizedBase === 'response') return 'Response'

  const prefix = baseName.replace(/\s+\d+$/, '').trim()
  const normalizedPrefix = normalizeBlockName(prefix)
  const numbers = Object.values(workflow.state.blocks).flatMap((block) => {
    const blockPrefix = block.name.replace(/\s+\d+$/, '').trim()
    if (normalizeBlockName(blockPrefix) !== normalizedPrefix) return []
    const suffix = block.name.match(/(\d+)$/)
    return [suffix ? Number.parseInt(suffix[1], 10) : 0]
  })
  return `${prefix} ${numbers.length === 0 ? 1 : Math.max(...numbers) + 1}`
}

export function addEditorBlock(
  workflow: EditorWorkflow,
  template: EditorBlockTemplateV1,
  blockId: string,
  position: { x: number; y: number }
): EditorWorkflow {
  if (workflow.locked) throw new Error('This workflow is read only')
  if (workflow.state.blocks[blockId]) throw new Error('The new block ID is already in use')
  if (
    template.singleInstance &&
    Object.values(workflow.state.blocks).some((block) => block.type === template.type)
  ) {
    throw new Error(`Only one ${template.name} block is allowed`)
  }

  const subBlocks = Object.fromEntries(
    template.fields.map((field) => [
      field.id,
      {
        id: field.id,
        type: field.type,
        value: materializeInitialValue(field.initialValue),
      },
    ])
  )
  const canonicalModes = structuredClone(template.canonicalModes)
  const block: EditorBlock = {
    id: blockId,
    type: template.type,
    name: uniqueBlockName(workflow, template.name),
    position,
    subBlocks,
    outputs: structuredClone(template.outputs),
    enabled: true,
    horizontalHandles: true,
    advancedMode: false,
    triggerMode: false,
    height: 0,
    locked: false,
    ...(Object.keys(canonicalModes).length > 0 ? { data: { canonicalModes } } : {}),
  }
  return {
    ...workflow,
    state: {
      ...workflow.state,
      blocks: {
        ...workflow.state.blocks,
        [blockId]: block,
      },
    },
  }
}

export function addEditorContainer(
  workflow: EditorWorkflow,
  kind: EditorContainerKind,
  blockId: string,
  position: { x: number; y: number }
): EditorWorkflow {
  if (workflow.locked) throw new Error('This workflow is read only')
  if (workflow.state.blocks[blockId]) throw new Error('The new block ID is already in use')

  const data =
    kind === 'loop'
      ? {
          width: 500,
          height: 300,
          type: 'subflowNode',
          loopType: 'for',
          count: 5,
          collection: '',
          whileCondition: '',
          doWhileCondition: '',
        }
      : {
          width: 500,
          height: 300,
          type: 'subflowNode',
          parallelType: 'count',
          count: 5,
          batchSize: 20,
          collection: '',
        }
  const block: EditorBlock = {
    id: blockId,
    type: kind,
    name: uniqueBlockName(workflow, kind === 'loop' ? 'Loop' : 'Parallel'),
    position,
    subBlocks: {},
    outputs: {},
    enabled: true,
    horizontalHandles: true,
    advancedMode: false,
    triggerMode: false,
    height: 300,
    locked: false,
    data,
  }
  const blocks = { ...workflow.state.blocks, [blockId]: block }
  return {
    ...workflow,
    state: {
      ...workflow.state,
      blocks,
      ...synchronizedContainerState(workflow, blocks),
    },
  }
}

export function updateEditorContainer(
  workflow: EditorWorkflow,
  blockId: string,
  patch: EditorContainerPatch
): EditorWorkflow {
  const block = editableBlock(workflow, blockId)
  if (block.type !== 'loop' && block.type !== 'parallel') {
    throw new Error('The selected block is not a container')
  }
  const count = patch.count
  const batchSize = patch.batchSize
  if (count !== undefined && (!Number.isInteger(count) || count < 1)) {
    throw new Error('Container count must be a positive integer')
  }
  if (
    batchSize !== undefined &&
    (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 20)
  ) {
    throw new Error('Parallel batch size must be between 1 and 20')
  }
  const updatedBlock = {
    ...block,
    data: {
      ...block.data,
      ...patch,
    },
  }
  const blocks = { ...workflow.state.blocks, [blockId]: updatedBlock }
  return {
    ...workflow,
    state: {
      ...workflow.state,
      blocks,
      ...synchronizedContainerState(workflow, blocks),
    },
  }
}

export function setEditorBlockParent(
  workflow: EditorWorkflow,
  blockId: string,
  containerId: string | null
): EditorWorkflow {
  const block = editableBlock(workflow, blockId)
  const absolutePosition = editorBlockPosition(workflow, blockId)
  let position = absolutePosition
  let data: EditorBlock['data']

  if (containerId) {
    const container = editableBlock(workflow, containerId)
    if (container.type !== 'loop' && container.type !== 'parallel') {
      throw new Error('The selected parent is not a container')
    }
    let ancestor: EditorBlock | undefined = container
    while (ancestor) {
      if (ancestor.id === blockId) throw new Error('A container cannot contain itself')
      const owner = parentId(ancestor)
      ancestor = owner ? workflow.state.blocks[owner] : undefined
    }
    const containerPosition = editorBlockPosition(workflow, containerId)
    position = {
      x: Math.max(24, absolutePosition.x - containerPosition.x),
      y: Math.max(56, absolutePosition.y - containerPosition.y),
    }
    data = { ...block.data, parentId: containerId, extent: 'parent' }
  } else {
    const { parentId: _parentId, extent: _extent, ...remainingData } = block.data ?? {}
    data = remainingData
  }

  const blocks = {
    ...workflow.state.blocks,
    [blockId]: { ...block, position, data },
  }
  return {
    ...workflow,
    state: {
      ...workflow.state,
      blocks,
      ...synchronizedContainerState(workflow, blocks),
    },
  }
}

export function updateEditorSubBlockValue(
  workflow: EditorWorkflow,
  blockId: string,
  fieldId: string,
  value: EditorTemplateJsonValue
): EditorWorkflow {
  const block = editableBlock(workflow, blockId)
  const current = block.subBlocks[fieldId]
  if (!current || typeof current !== 'object' || Array.isArray(current)) {
    throw new Error('The selected field no longer exists')
  }
  const subBlocks = {
    ...block.subBlocks,
    [fieldId]: {
      ...current,
      value: structuredClone(value),
    },
  }
  return {
    ...workflow,
    state: {
      ...workflow.state,
      blocks: {
        ...workflow.state.blocks,
        [blockId]: {
          ...block,
          subBlocks,
          outputs: dynamicEditorOutputs(block, subBlocks, fieldId),
        },
      },
    },
  }
}

function inputFormatOutputs(value: unknown): EditorBlock['outputs'] {
  if (!Array.isArray(value)) return {}
  return Object.fromEntries(
    value.flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return []
      const record = item as Record<string, unknown>
      const name = typeof record.name === 'string' ? record.name.trim() : ''
      if (!name) return []
      return [[name, { type: typeof record.type === 'string' ? record.type : 'any' }]]
    })
  )
}

const startOutputs: EditorBlock['outputs'] = {
  input: { type: 'string' },
  conversationId: { type: 'string' },
  files: { type: 'file[]' },
}

const startMetadataOutput = {
  type: 'json',
  properties: {
    userEmail: { type: 'string' },
    workspaceId: { type: 'string' },
    workflowId: { type: 'string' },
    executionId: { type: 'string' },
    executionType: { type: 'string' },
    executionMode: { type: 'string' },
    startTime: { type: 'string' },
  },
}

function subBlockValue(subBlocks: EditorBlock['subBlocks'], id: string): unknown {
  const item = subBlocks[id]
  return item && typeof item === 'object' && !Array.isArray(item) && 'value' in item
    ? item.value
    : undefined
}

function dynamicEditorOutputs(
  block: EditorBlock,
  subBlocks: EditorBlock['subBlocks'],
  changedFieldId: string
): EditorBlock['outputs'] {
  if (changedFieldId !== 'inputFormat' && changedFieldId !== 'runMetadata') return block.outputs
  const custom = inputFormatOutputs(subBlockValue(subBlocks, 'inputFormat'))
  if (block.type === 'start_trigger') {
    const metadata = subBlockValue(subBlocks, 'runMetadata')
    return {
      ...startOutputs,
      ...custom,
      ...(metadata === true || metadata === 'true' ? { metadata: startMetadataOutput } : {}),
    }
  }
  if (block.type === 'api_trigger' || block.type === 'input_trigger') return custom
  if (block.type === 'generic_webhook' && Object.keys(custom).length > 0) return custom
  return { ...block.outputs, ...custom }
}

export function updateEditorBlock(
  workflow: EditorWorkflow,
  blockId: string,
  patch: BlockPatch
): EditorWorkflow {
  const block = editableBlock(workflow, blockId)
  const name = patch.name === undefined ? block.name : patch.name.trim()
  const normalizedName = normalizeBlockName(name)
  if (!normalizedName) throw new Error('Block name cannot be empty')
  if (RESERVED_BLOCK_NAMES.has(normalizedName)) {
    throw new Error(`"${name}" is a reserved block name`)
  }
  const conflict = Object.values(workflow.state.blocks).find(
    (candidate) => candidate.id !== blockId && normalizeBlockName(candidate.name) === normalizedName
  )
  if (conflict) throw new Error(`Another block is already named "${name}"`)

  const oldNormalizedName = normalizeBlockName(block.name)
  const referencesChanged = oldNormalizedName !== normalizedName
  const blocks = Object.fromEntries(
    Object.entries(workflow.state.blocks).map(([candidateId, candidate]) => {
      if (candidateId === blockId) {
        return [
          candidateId,
          {
            ...candidate,
            name,
            enabled: patch.enabled ?? candidate.enabled,
          },
        ]
      }
      if (!referencesChanged) return [candidateId, candidate]
      const subBlocks = replaceReference(
        candidate.subBlocks,
        `<${oldNormalizedName}.`,
        `<${normalizedName}.`
      ) as EditorBlock['subBlocks']
      return subBlocks === candidate.subBlocks
        ? [candidateId, candidate]
        : [candidateId, { ...candidate, subBlocks }]
    })
  )

  return {
    ...workflow,
    state: {
      ...workflow.state,
      blocks,
      ...synchronizedContainerState(workflow, blocks),
    },
  }
}

export function removeEditorBlock(workflow: EditorWorkflow, blockId: string): EditorWorkflow {
  editableBlock(workflow, blockId)
  const child = Object.values(workflow.state.blocks).find(
    (candidate) => parentId(candidate) === blockId
  )
  if (child) {
    throw new Error(`Remove child block "${child.name}" before deleting this container`)
  }
  const { [blockId]: _removed, ...blocks } = workflow.state.blocks
  const { [blockId]: _removedLoop, ...loops } = workflow.state.loops ?? {}
  const { [blockId]: _removedParallel, ...parallels } = workflow.state.parallels ?? {}
  return {
    ...workflow,
    state: {
      ...workflow.state,
      blocks,
      edges: workflow.state.edges.filter(
        (edge) => edge.source !== blockId && edge.target !== blockId
      ),
      ...synchronizedContainerState(
        { ...workflow, state: { ...workflow.state, loops, parallels } },
        blocks
      ),
    },
  }
}

function reaches(edges: EditorWorkflow['state']['edges'], source: string, target: string): boolean {
  const visited = new Set<string>()
  const pending = [source]
  while (pending.length > 0) {
    const current = pending.pop()
    if (!current || visited.has(current)) continue
    if (current === target) return true
    visited.add(current)
    for (const edge of edges) {
      if (edge.source === current) pending.push(edge.target)
    }
  }
  return false
}

export function connectEditorBlocks(
  workflow: EditorWorkflow,
  source: string,
  target: string,
  edgeId: string
): EditorWorkflow {
  editableBlock(workflow, source)
  editableBlock(workflow, target)
  if (source === target) throw new Error('A block cannot connect to itself')
  if (workflow.state.edges.some((edge) => edge.source === source && edge.target === target)) {
    throw new Error('These blocks are already connected')
  }
  if (reaches(workflow.state.edges, target, source)) {
    throw new Error('This connection would create a cycle')
  }
  return {
    ...workflow,
    state: {
      ...workflow.state,
      edges: [...workflow.state.edges, { id: edgeId, source, target }],
    },
  }
}

export function removeEditorEdge(workflow: EditorWorkflow, edgeId: string): EditorWorkflow {
  if (workflow.locked) throw new Error('This workflow is read only')
  const edge = workflow.state.edges.find((candidate) => candidate.id === edgeId)
  if (!edge) {
    throw new Error('The selected connection no longer exists')
  }
  if (
    workflow.state.blocks[edge.source]?.locked === true ||
    workflow.state.blocks[edge.target]?.locked === true
  ) {
    throw new Error('A locked block connection cannot be removed')
  }
  return {
    ...workflow,
    state: {
      ...workflow.state,
      edges: workflow.state.edges.filter((edge) => edge.id !== edgeId),
    },
  }
}

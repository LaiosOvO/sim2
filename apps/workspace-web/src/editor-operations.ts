import { generateId } from '@sim/utils/id'
import type { EditorBlock, EditorWorkflow } from './editor-api'

export interface EditorRealtimeOperation {
  operation: string
  operationId: string
  payload: Record<string, unknown>
  target: string
  timestamp: number
}

export type EditorRemoteOperationResult =
  | { status: 'applied'; workflow: EditorWorkflow }
  | { status: 'conflict' | 'unsupported' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function editorBlock(value: unknown): EditorBlock | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.type !== 'string' ||
    typeof value.name !== 'string' ||
    !isRecord(value.position) ||
    typeof value.position.x !== 'number' ||
    typeof value.position.y !== 'number' ||
    !isRecord(value.subBlocks) ||
    !isRecord(value.outputs)
  ) {
    return null
  }
  return {
    ...value,
    id: value.id,
    type: value.type,
    name: value.name,
    position: { x: value.position.x, y: value.position.y },
    subBlocks: value.subBlocks,
    outputs: value.outputs,
    enabled: value.enabled !== false,
  }
}

function editorEdge(value: unknown): EditorWorkflow['state']['edges'][number] | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.source !== 'string' ||
    typeof value.target !== 'string'
  ) {
    return null
  }
  return { ...value, id: value.id, source: value.source, target: value.target }
}

function updateBlock(
  workflow: EditorWorkflow,
  id: string,
  transform: (block: EditorBlock) => EditorBlock
): EditorRemoteOperationResult {
  const block = workflow.state.blocks[id]
  if (!block) return { status: 'conflict' }
  return {
    status: 'applied',
    workflow: {
      ...workflow,
      state: {
        ...workflow.state,
        blocks: { ...workflow.state.blocks, [id]: transform(block) },
      },
    },
  }
}

export function applyEditorRemoteOperation(
  workflow: EditorWorkflow,
  event: unknown
): EditorRemoteOperationResult {
  if (!isRecord(event) || typeof event.operation !== 'string' || !isRecord(event.payload)) {
    return { status: 'unsupported' }
  }
  const { operation: name, payload } = event
  if (name === 'update-position' && typeof payload.id === 'string' && isRecord(payload.position)) {
    const position = payload.position
    if (typeof position.x !== 'number' || typeof position.y !== 'number') {
      return { status: 'unsupported' }
    }
    return updateBlock(workflow, payload.id, (block) => ({
      ...block,
      position: { x: position.x as number, y: position.y as number },
    }))
  }
  if (
    name === 'update-name' &&
    typeof payload.id === 'string' &&
    typeof payload.name === 'string'
  ) {
    return updateBlock(workflow, payload.id, (block) => ({
      ...block,
      name: payload.name as string,
    }))
  }
  if (
    name === 'toggle-enabled' &&
    typeof payload.id === 'string' &&
    typeof payload.enabled === 'boolean'
  ) {
    return updateBlock(workflow, payload.id, (block) => ({
      ...block,
      enabled: payload.enabled as boolean,
    }))
  }
  if (
    name === 'update-advanced-mode' &&
    typeof payload.id === 'string' &&
    typeof payload.advancedMode === 'boolean'
  ) {
    return updateBlock(workflow, payload.id, (block) => ({
      ...block,
      advancedMode: payload.advancedMode as boolean,
    }))
  }
  if (name === 'update-parent' && typeof payload.id === 'string') {
    if (payload.parentId !== null && typeof payload.parentId !== 'string') {
      return { status: 'unsupported' }
    }
    const position =
      isRecord(payload.position) &&
      typeof payload.position.x === 'number' &&
      typeof payload.position.y === 'number'
        ? { x: payload.position.x, y: payload.position.y }
        : null
    return updateBlock(workflow, payload.id, (block) => {
      const data = { ...(block.data ?? {}) }
      if (typeof payload.parentId === 'string') data.parentId = payload.parentId
      else data.parentId = undefined
      return { ...block, data, ...(position ? { position } : {}) }
    })
  }
  if (name === 'subblock-batch-update' && Array.isArray(payload.updates)) {
    let next = workflow
    for (const entry of payload.updates) {
      if (
        !isRecord(entry) ||
        typeof entry.blockId !== 'string' ||
        typeof entry.subblockId !== 'string'
      ) {
        return { status: 'unsupported' }
      }
      const block = next.state.blocks[entry.blockId]
      const current = block?.subBlocks[entry.subblockId]
      if (!block || !isRecord(current)) return { status: 'conflict' }
      if ('expectedValue' in entry && !equal(current.value, entry.expectedValue)) {
        return { status: 'conflict' }
      }
      next = {
        ...next,
        state: {
          ...next.state,
          blocks: {
            ...next.state.blocks,
            [block.id]: {
              ...block,
              subBlocks: {
                ...block.subBlocks,
                [entry.subblockId]: { ...current, value: entry.value },
              },
            },
          },
        },
      }
    }
    return { status: 'applied', workflow: next }
  }
  if (name === 'batch-add-blocks' && Array.isArray(payload.blocks)) {
    const additions = payload.blocks.map(editorBlock)
    if (additions.some((block) => !block)) return { status: 'unsupported' }
    const blocks = { ...workflow.state.blocks }
    for (const block of additions) {
      if (!block || blocks[block.id]) return { status: 'conflict' }
      blocks[block.id] = block
    }
    return {
      status: 'applied',
      workflow: {
        ...workflow,
        state: {
          ...workflow.state,
          blocks,
          ...(isRecord(payload.loops)
            ? { loops: { ...(workflow.state.loops ?? {}), ...payload.loops } }
            : {}),
          ...(isRecord(payload.parallels)
            ? { parallels: { ...(workflow.state.parallels ?? {}), ...payload.parallels } }
            : {}),
        },
      },
    }
  }
  if (name === 'batch-remove-blocks' && Array.isArray(payload.ids)) {
    const ids = payload.ids.filter((id): id is string => typeof id === 'string')
    if (ids.length !== payload.ids.length) return { status: 'unsupported' }
    if (ids.some((id) => !workflow.state.blocks[id])) return { status: 'conflict' }
    const removed = new Set(ids)
    const blocks = Object.fromEntries(
      Object.entries(workflow.state.blocks).filter(([id]) => !removed.has(id))
    )
    return {
      status: 'applied',
      workflow: {
        ...workflow,
        state: {
          ...workflow.state,
          blocks,
          edges: workflow.state.edges.filter(
            (edge) => !removed.has(edge.source) && !removed.has(edge.target)
          ),
          loops: Object.fromEntries(
            Object.entries(workflow.state.loops ?? {}).filter(([id]) => !removed.has(id))
          ),
          parallels: Object.fromEntries(
            Object.entries(workflow.state.parallels ?? {}).filter(([id]) => !removed.has(id))
          ),
        },
      },
    }
  }
  if (name === 'batch-remove-edges' && Array.isArray(payload.ids)) {
    const ids = payload.ids.filter((id): id is string => typeof id === 'string')
    if (ids.length !== payload.ids.length) return { status: 'unsupported' }
    return {
      status: 'applied',
      workflow: {
        ...workflow,
        state: {
          ...workflow.state,
          edges: workflow.state.edges.filter((edge) => !ids.includes(edge.id)),
        },
      },
    }
  }
  if (name === 'batch-add-edges' && Array.isArray(payload.edges)) {
    const additions = payload.edges.map(editorEdge)
    if (additions.some((edge) => !edge)) return { status: 'unsupported' }
    const byId = new Map(workflow.state.edges.map((edge) => [edge.id, edge]))
    for (const edge of additions) {
      if (!edge) continue
      if (!workflow.state.blocks[edge.source] || !workflow.state.blocks[edge.target]) {
        return { status: 'conflict' }
      }
      byId.set(edge.id, edge)
    }
    return {
      status: 'applied',
      workflow: { ...workflow, state: { ...workflow.state, edges: [...byId.values()] } },
    }
  }
  if (
    name === 'update' &&
    typeof payload.id === 'string' &&
    (payload.type === 'loop' || payload.type === 'parallel') &&
    isRecord(payload.config)
  ) {
    const collection = payload.type === 'loop' ? 'loops' : 'parallels'
    return {
      status: 'applied',
      workflow: {
        ...workflow,
        state: {
          ...workflow.state,
          [collection]: {
            ...(workflow.state[collection] ?? {}),
            [payload.id]: payload.config,
          },
        },
      },
    }
  }
  return { status: 'unsupported' }
}

function historyRebaseEvent(event: unknown): unknown {
  if (!isRecord(event) || event.operation !== 'subblock-batch-update' || !isRecord(event.payload)) {
    return event
  }
  const updates = event.payload.updates
  if (!Array.isArray(updates)) return event
  return {
    ...event,
    payload: {
      ...event.payload,
      updates: updates.map((entry) => {
        if (!isRecord(entry)) return entry
        const { expectedValue: _expectedValue, ...update } = entry
        return update
      }),
    },
  }
}

/**
 * Applies a collaborator's edit to local undo/redo snapshots. Snapshots where
 * the target does not exist are intentionally retained: for example, the
 * "before" snapshot of a locally-added block must remain block-free when a
 * collaborator later moves that block. Consecutive/no-op snapshots are pruned.
 */
export function rebaseEditorHistory(
  history: EditorWorkflow[],
  current: EditorWorkflow,
  event: unknown
): EditorWorkflow[] {
  const rebaseEvent = historyRebaseEvent(event)
  const rebased = history.map((snapshot) => {
    const result = applyEditorRemoteOperation(snapshot, rebaseEvent)
    return result.status === 'applied' ? result.workflow : snapshot
  })
  const compacted: EditorWorkflow[] = []
  for (const snapshot of rebased) {
    if (!equal(compacted.at(-1), snapshot)) compacted.push(snapshot)
  }
  while (equal(compacted.at(-1), current)) compacted.pop()
  return compacted
}

export function rebaseEditorHistoryToWorkflow(
  history: EditorWorkflow[],
  current: EditorWorkflow,
  next: EditorWorkflow
): EditorWorkflow[] {
  let latest = current
  let rebased = history
  for (const event of buildEditorOperations(current, next)) {
    const result = applyEditorRemoteOperation(latest, event)
    if (result.status !== 'applied') continue
    latest = result.workflow
    rebased = rebaseEditorHistory(rebased, latest, event)
  }
  return rebased
}

function equal(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function operation(
  name: string,
  target: string,
  payload: Record<string, unknown>
): EditorRealtimeOperation {
  return {
    operation: name,
    target,
    payload,
    timestamp: Date.now(),
    operationId: generateId(),
  }
}

function subBlockValue(block: EditorBlock, fieldId: string): unknown {
  const field = block.subBlocks[fieldId]
  return field && typeof field === 'object' && !Array.isArray(field) && 'value' in field
    ? field.value
    : undefined
}

function blockOperations(before: EditorBlock, after: EditorBlock): EditorRealtimeOperation[] {
  const operations: EditorRealtimeOperation[] = []
  if (!equal(before.position, after.position)) {
    operations.push(
      operation('update-position', 'block', {
        id: after.id,
        position: after.position,
        commit: true,
      })
    )
  }
  if (before.name !== after.name) {
    operations.push(operation('update-name', 'block', { id: after.id, name: after.name }))
  }
  if (before.enabled !== after.enabled) {
    operations.push(
      operation('toggle-enabled', 'block', { id: after.id, enabled: after.enabled !== false })
    )
  }
  if (before.advancedMode !== after.advancedMode) {
    operations.push(
      operation('update-advanced-mode', 'block', {
        id: after.id,
        advancedMode: after.advancedMode === true,
      })
    )
  }
  const beforeParent = typeof before.data?.parentId === 'string' ? before.data.parentId : null
  const afterParent = typeof after.data?.parentId === 'string' ? after.data.parentId : null
  if (beforeParent !== afterParent) {
    operations.push(
      operation('update-parent', 'block', {
        id: after.id,
        parentId: afterParent,
        extent: afterParent ? 'parent' : null,
        position: after.position,
      })
    )
  }

  const updates = Array.from(
    new Set([...Object.keys(before.subBlocks), ...Object.keys(after.subBlocks)])
  ).flatMap((fieldId) => {
    const previousValue = subBlockValue(before, fieldId)
    const value = subBlockValue(after, fieldId)
    if (equal(previousValue, value)) return []
    return [{ blockId: after.id, subblockId: fieldId, value, expectedValue: previousValue }]
  })
  if (updates.length > 0) {
    operations.push(operation('subblock-batch-update', 'subblock', { updates }))
  }
  return operations
}

export function buildEditorOperations(
  before: EditorWorkflow,
  after: EditorWorkflow
): EditorRealtimeOperation[] {
  const operations: EditorRealtimeOperation[] = []
  const beforeIds = new Set(Object.keys(before.state.blocks))
  const afterIds = new Set(Object.keys(after.state.blocks))
  const addedIds = [...afterIds].filter((id) => !beforeIds.has(id))
  const removedIds = [...beforeIds].filter((id) => !afterIds.has(id))

  if (addedIds.length > 0) {
    const addedIdSet = new Set(addedIds)
    operations.push(
      operation('batch-add-blocks', 'blocks', {
        blocks: addedIds.map((id) => after.state.blocks[id]),
        loops: Object.fromEntries(
          Object.entries(after.state.loops ?? {}).filter(([id]) => addedIdSet.has(id))
        ),
        parallels: Object.fromEntries(
          Object.entries(after.state.parallels ?? {}).filter(([id]) => addedIdSet.has(id))
        ),
      })
    )
  }
  if (removedIds.length > 0) {
    operations.push(operation('batch-remove-blocks', 'blocks', { ids: removedIds }))
  }
  for (const id of [...beforeIds].filter((candidate) => afterIds.has(candidate))) {
    operations.push(...blockOperations(before.state.blocks[id], after.state.blocks[id]))
  }

  const beforeEdges = new Map(before.state.edges.map((edge) => [edge.id, edge]))
  const afterEdges = new Map(after.state.edges.map((edge) => [edge.id, edge]))
  const addedEdges = [...afterEdges.entries()]
    .filter(([id, edge]) => !equal(beforeEdges.get(id), edge))
    .map(([, edge]) => edge)
  const removedEdges = [...beforeEdges.entries()]
    .filter(([id, edge]) => !equal(afterEdges.get(id), edge))
    .map(([id]) => id)
  if (removedEdges.length > 0) {
    operations.push(operation('batch-remove-edges', 'edges', { ids: removedEdges }))
  }
  if (addedEdges.length > 0) {
    operations.push(operation('batch-add-edges', 'edges', { edges: addedEdges }))
  }

  for (const [type, beforeSubflows, afterSubflows] of [
    ['loop', before.state.loops ?? {}, after.state.loops ?? {}],
    ['parallel', before.state.parallels ?? {}, after.state.parallels ?? {}],
  ] as const) {
    for (const [id, config] of Object.entries(afterSubflows)) {
      if (!beforeIds.has(id) || !afterIds.has(id) || equal(beforeSubflows[id], config)) continue
      if (!config || typeof config !== 'object' || Array.isArray(config)) continue
      operations.push(operation('update', 'subflow', { id, type, config }))
    }
  }

  return operations
}

export function publishEditorOperations(
  before: EditorWorkflow,
  after: EditorWorkflow
): EditorRealtimeOperation[] {
  const operations = buildEditorOperations(before, after)
  queueMicrotask(() => {
    for (const detail of operations) {
      window.dispatchEvent(new CustomEvent('sim-vite-editor-operation', { detail }))
      window.setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent('sim-vite-editor-operation-settled', {
            detail: { operationId: detail.operationId, persisted: false, timedOut: true },
          })
        )
      }, 10_000)
    }
  })
  return operations
}

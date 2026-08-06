export interface EditorBlock {
  [key: string]: unknown
  advancedMode?: boolean
  data?: Record<string, unknown> & {
    height?: number
    width?: number
  }
  enabled: boolean
  height?: number
  id: string
  locked?: boolean
  name: string
  outputs: Record<string, unknown>
  position: { x: number; y: number }
  subBlocks: Record<string, unknown>
  type: string
}

export interface EditorEdge {
  [key: string]: unknown
  animated?: boolean
  id: string
  label?: string
  source: string
  target: string
}

export interface EditorWorkflow {
  description: string | null
  id: string
  isDeployed: boolean
  locked: boolean
  name: string
  state: {
    blocks: Record<string, EditorBlock>
    edges: EditorEdge[]
    loops?: Record<string, unknown>
    parallels?: Record<string, unknown>
    variables?: Record<string, unknown>
  }
  workspaceId: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isPosition(value: unknown): value is { x: number; y: number } {
  return (
    isRecord(value) &&
    typeof value.x === 'number' &&
    Number.isFinite(value.x) &&
    typeof value.y === 'number' &&
    Number.isFinite(value.y)
  )
}

function normalizeBlock(id: string, value: unknown): EditorBlock | null {
  if (!isRecord(value) || !isPosition(value.position)) return null
  return {
    ...value,
    id: typeof value.id === 'string' ? value.id : id,
    type: typeof value.type === 'string' ? value.type : 'unknown',
    name: typeof value.name === 'string' ? value.name : 'Untitled block',
    position: value.position,
    subBlocks: isRecord(value.subBlocks) ? value.subBlocks : {},
    outputs: isRecord(value.outputs) ? value.outputs : {},
    enabled: value.enabled !== false,
    ...(typeof value.height === 'number' ? { height: value.height } : {}),
    ...(typeof value.advancedMode === 'boolean' ? { advancedMode: value.advancedMode } : {}),
    ...(isRecord(value.data) ? { data: value.data } : {}),
  }
}

function normalizeWorkflow(payload: unknown): EditorWorkflow {
  if (!isRecord(payload) || !isRecord(payload.data)) {
    throw new Error('Workflow response is invalid')
  }
  const data = payload.data
  if (!isRecord(data.state)) throw new Error('Workflow state is invalid')
  const state = data.state
  const sourceBlocks = isRecord(state.blocks) ? state.blocks : {}
  const blocks: Record<string, EditorBlock> = {}
  for (const [id, value] of Object.entries(sourceBlocks)) {
    const block = normalizeBlock(id, value)
    if (block) blocks[id] = block
  }
  const edges = Array.isArray(state.edges)
    ? state.edges.flatMap((value): EditorEdge[] => {
        if (
          !isRecord(value) ||
          typeof value.id !== 'string' ||
          typeof value.source !== 'string' ||
          typeof value.target !== 'string'
        ) {
          return []
        }
        return [
          {
            ...value,
            id: value.id,
            source: value.source,
            target: value.target,
            ...(typeof value.label === 'string' ? { label: value.label } : {}),
            ...(typeof value.animated === 'boolean' ? { animated: value.animated } : {}),
          },
        ]
      })
    : []

  return {
    id: typeof data.id === 'string' ? data.id : '',
    workspaceId: typeof data.workspaceId === 'string' ? data.workspaceId : null,
    name: typeof data.name === 'string' ? data.name : 'Untitled workflow',
    description: typeof data.description === 'string' ? data.description : null,
    isDeployed: data.isDeployed === true,
    locked: data.locked === true,
    state: {
      blocks,
      edges,
      ...(isRecord(state.loops) ? { loops: state.loops } : {}),
      ...(isRecord(state.parallels) ? { parallels: state.parallels } : {}),
      ...(isRecord(data.variables) ? { variables: data.variables } : {}),
    },
  }
}

export async function loadEditorWorkflow(
  workflowId: string,
  signal?: AbortSignal
): Promise<EditorWorkflow> {
  const response = await fetch(`/api/workflows/${encodeURIComponent(workflowId)}`, {
    credentials: 'include',
    signal,
  })
  if (!response.ok) throw new Error(`Unable to load workflow: ${response.status}`)
  return normalizeWorkflow(await response.json())
}

export async function saveEditorWorkflow(workflow: EditorWorkflow): Promise<void> {
  const response = await fetch(`/api/workflows/${encodeURIComponent(workflow.id)}/state`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      blocks: workflow.state.blocks,
      edges: workflow.state.edges,
      loops: workflow.state.loops ?? {},
      parallels: workflow.state.parallels ?? {},
      variables: workflow.state.variables ?? {},
      lastSaved: Date.now(),
      isDeployed: workflow.isDeployed,
    }),
  })
  if (!response.ok) throw new Error(`Unable to save workflow: ${response.status}`)
}

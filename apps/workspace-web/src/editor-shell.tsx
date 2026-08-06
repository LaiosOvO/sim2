import {
  type CSSProperties,
  lazy,
  type PointerEvent as ReactPointerEvent,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { generateId } from '@sim/utils/id'
import {
  type EditorBlock,
  type EditorWorkflow,
  loadEditorWorkflow,
  saveEditorWorkflow,
} from './editor-api'
import {
  applyEditorRemoteOperation,
  publishEditorOperations,
  rebaseEditorHistory,
  rebaseEditorHistoryToWorkflow,
} from './editor-operations'
import {
  addEditorBlock,
  addEditorContainer,
  type EditorContainerKind,
  editorBlockPosition,
} from './editor-state'
import { loadEditorBlockTemplate } from './editor-templates'
import { legacyEditorHref } from './runtime-links'

const ToolCatalogPanel = lazy(() =>
  import('./tool-catalog-panel').then((module) => ({ default: module.ToolCatalogPanel }))
)
const EditorInspector = lazy(() =>
  import('./editor-inspector').then((module) => ({ default: module.EditorInspector }))
)
const EditorActivityPanel = lazy(() =>
  import('./editor-activity-panel').then((module) => ({ default: module.EditorActivityPanel }))
)
const EditorRunPanel = lazy(() =>
  import('./editor-run-panel').then((module) => ({ default: module.EditorRunPanel }))
)
const EditorCollaborationBridge = lazy(() =>
  import('./editor-collaboration').then((module) => ({
    default: module.EditorCollaborationBridge,
  }))
)

interface EditorShellProps {
  nextOrigin: string
  workflowId: string
  workspaceId: string
}

interface DragState {
  blockId: string
  historyRecorded: boolean
  origin: { x: number; y: number }
  pointer: { x: number; y: number }
}

interface RemoteCursorView {
  socketId: string
  userName: string
  x: number
  y: number
}

interface RemoteSelectionView {
  blockId: string | null
  socketId: string
  userName: string
}

const NODE_WIDTH = 210
const NODE_HEIGHT = 72

export function EditorShell({ nextOrigin, workflowId, workspaceId }: EditorShellProps) {
  const [workflow, setWorkflow] = useState<EditorWorkflow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [activityOpen, setActivityOpen] = useState(false)
  const [runOpen, setRunOpen] = useState(false)
  const [historyCounts, setHistoryCounts] = useState({ redo: 0, undo: 0 })
  const [pendingOperationCount, setPendingOperationCount] = useState(0)
  const [remoteCursors, setRemoteCursors] = useState<Record<string, RemoteCursorView>>({})
  const [remoteSelections, setRemoteSelections] = useState<Record<string, RemoteSelectionView>>({})
  const dragRef = useRef<DragState | null>(null)
  const changeVersionRef = useRef(0)
  const workflowRef = useRef<EditorWorkflow | null>(null)
  const savedWorkflowRef = useRef<EditorWorkflow | null>(null)
  const undoRef = useRef<EditorWorkflow[]>([])
  const redoRef = useRef<EditorWorkflow[]>([])
  const pendingOperationIdsRef = useRef(new Set<string>())
  const dirtyRef = useRef(false)
  const savingRef = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    setError(null)
    void loadEditorWorkflow(workflowId, controller.signal)
      .then((loadedWorkflow) => {
        workflowRef.current = loadedWorkflow
        savedWorkflowRef.current = loadedWorkflow
        undoRef.current = []
        redoRef.current = []
        pendingOperationIdsRef.current.clear()
        setPendingOperationCount(0)
        setWorkflow(loadedWorkflow)
        setDirty(false)
        changeVersionRef.current = 0
        setRemoteCursors({})
        setRemoteSelections({})
        setHistoryCounts({ redo: 0, undo: 0 })
      })
      .catch((caught) => {
        if (!controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : 'Unable to load workflow')
        }
      })
    return () => controller.abort()
  }, [workflowId])

  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])

  useEffect(() => {
    const settleOperation = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail
      if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return
      const operationId = (detail as Record<string, unknown>).operationId
      if (typeof operationId !== 'string') return
      pendingOperationIdsRef.current.delete(operationId)
      setPendingOperationCount(pendingOperationIdsRef.current.size)
    }
    window.addEventListener('sim-vite-editor-operation-settled', settleOperation)
    return () => window.removeEventListener('sim-vite-editor-operation-settled', settleOperation)
  }, [])

  const publishTrackedOperations = useCallback((before: EditorWorkflow, after: EditorWorkflow) => {
    const operations = publishEditorOperations(before, after)
    for (const entry of operations) pendingOperationIdsRef.current.add(entry.operationId)
    setPendingOperationCount(pendingOperationIdsRef.current.size)
  }, [])

  const pushUndo = useCallback((current: EditorWorkflow) => {
    undoRef.current = [...undoRef.current.slice(-49), current]
    redoRef.current = []
    setHistoryCounts({ redo: 0, undo: undoRef.current.length })
  }, [])

  const applyLocalChange = useCallback(
    (nextWorkflow: EditorWorkflow) => {
      const current = workflowRef.current
      if (!current || current === nextWorkflow) return
      pushUndo(current)
      publishTrackedOperations(current, nextWorkflow)
      workflowRef.current = nextWorkflow
      setWorkflow(nextWorkflow)
      changeVersionRef.current += 1
      setDirty(nextWorkflow !== savedWorkflowRef.current)
    },
    [publishTrackedOperations, pushUndo]
  )

  const undo = useCallback(() => {
    const current = workflowRef.current
    const previous = undoRef.current.pop()
    if (!current || !previous) return
    redoRef.current = [...redoRef.current.slice(-49), current]
    publishTrackedOperations(current, previous)
    workflowRef.current = previous
    setWorkflow(previous)
    changeVersionRef.current += 1
    setDirty(previous !== savedWorkflowRef.current)
    setHistoryCounts({ redo: redoRef.current.length, undo: undoRef.current.length })
  }, [publishTrackedOperations])

  const redo = useCallback(() => {
    const current = workflowRef.current
    const next = redoRef.current.pop()
    if (!current || !next) return
    undoRef.current = [...undoRef.current.slice(-49), current]
    publishTrackedOperations(current, next)
    workflowRef.current = next
    setWorkflow(next)
    changeVersionRef.current += 1
    setDirty(next !== savedWorkflowRef.current)
    setHistoryCounts({ redo: redoRef.current.length, undo: undoRef.current.length })
  }, [publishTrackedOperations])

  useEffect(() => {
    const handleHistoryShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return
      const target = event.target
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return
      }
      event.preventDefault()
      if (event.shiftKey) redo()
      else undo()
    }
    window.addEventListener('keydown', handleHistoryShortcut)
    return () => window.removeEventListener('keydown', handleHistoryShortcut)
  }, [redo, undo])

  useEffect(() => {
    if (!dirty) return
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [dirty])

  const blocks = useMemo(
    () =>
      Object.values(workflow?.state.blocks ?? {}).sort((left, right) => {
        const leftContainer = left.type === 'loop' || left.type === 'parallel'
        const rightContainer = right.type === 'loop' || right.type === 'parallel'
        return Number(rightContainer) - Number(leftContainer)
      }),
    [workflow]
  )
  const blockById = workflow?.state.blocks ?? {}

  const moveBlock = useCallback((blockId: string, x: number, y: number) => {
    setWorkflow((current) => {
      const block = current?.state.blocks[blockId]
      if (!current || !block) return current
      const updated = {
        ...current,
        state: {
          ...current.state,
          blocks: {
            ...current.state.blocks,
            [blockId]: { ...block, position: { x, y } },
          },
        },
      }
      workflowRef.current = updated
      return updated
    })
    changeVersionRef.current += 1
    setDirty(true)
  }, [])

  const finishDrag = () => {
    const state = dragRef.current
    const current = workflowRef.current
    if (state?.historyRecorded && current) {
      const before = undoRef.current.at(-1)
      if (before) publishTrackedOperations(before, current)
    }
    dragRef.current = null
  }

  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>, block: EditorBlock) => {
    setSelectedBlockId(block.id)
    window.dispatchEvent(
      new CustomEvent('sim-vite-editor-selection', {
        detail: { type: 'block', id: block.id },
      })
    )
    if (workflow?.locked || block.locked === true) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      blockId: block.id,
      historyRecorded: false,
      origin: block.position,
      pointer: { x: event.clientX, y: event.clientY },
    }
  }

  const drag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const state = dragRef.current
    if (!state) return
    if (!state.historyRecorded && workflowRef.current) {
      pushUndo(workflowRef.current)
      state.historyRecorded = true
    }
    moveBlock(
      state.blockId,
      Math.round(state.origin.x + event.clientX - state.pointer.x),
      Math.round(state.origin.y + event.clientY - state.pointer.y)
    )
  }

  const save = async () => {
    if (!workflow || workflow.locked || !dirty) return
    if (pendingOperationIdsRef.current.size > 0) {
      setError('Wait for collaborative operations to finish before saving.')
      return
    }
    const savedVersion = changeVersionRef.current
    setSaving(true)
    savingRef.current = true
    setError(null)
    try {
      await saveEditorWorkflow(workflow)
      savedWorkflowRef.current = workflow
      if (changeVersionRef.current === savedVersion) setDirty(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save workflow')
    } finally {
      setSaving(false)
      savingRef.current = false
    }
  }

  const refreshFromCollaboration = useCallback(() => {
    if (savingRef.current) return
    if (dirtyRef.current) {
      setError('A collaborator saved newer changes. Save or refresh before continuing.')
      return
    }
    void loadEditorWorkflow(workflowId)
      .then((loadedWorkflow) => {
        const current = workflowRef.current
        undoRef.current = current
          ? rebaseEditorHistoryToWorkflow(undoRef.current, current, loadedWorkflow)
          : []
        redoRef.current = current
          ? rebaseEditorHistoryToWorkflow(redoRef.current, current, loadedWorkflow)
          : []
        workflowRef.current = loadedWorkflow
        savedWorkflowRef.current = loadedWorkflow
        pendingOperationIdsRef.current.clear()
        setPendingOperationCount(0)
        setWorkflow(loadedWorkflow)
        changeVersionRef.current = 0
        setDirty(false)
        setError(null)
        setHistoryCounts({ redo: redoRef.current.length, undo: undoRef.current.length })
      })
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : 'Unable to apply collaborative update')
      })
  }, [workflowId])

  const applyRemoteOperation = useCallback(
    (event: unknown) => {
      if (savingRef.current) return
      if (dirtyRef.current) {
        setError(
          'A collaborator changed this workflow while local edits are pending. Save or refresh before continuing.'
        )
        return
      }
      const current = workflowRef.current
      if (!current) return
      const result = applyEditorRemoteOperation(current, event)
      if (result.status !== 'applied') {
        if (result.status === 'unsupported') refreshFromCollaboration()
        else {
          setError(
            'A collaborative operation conflicted with the local snapshot. Refreshing is required.'
          )
        }
        return
      }
      workflowRef.current = result.workflow
      savedWorkflowRef.current = result.workflow
      undoRef.current = rebaseEditorHistory(undoRef.current, result.workflow, event)
      redoRef.current = rebaseEditorHistory(redoRef.current, result.workflow, event)
      setWorkflow(result.workflow)
      setDirty(false)
      setError(null)
      setHistoryCounts({ redo: redoRef.current.length, undo: undoRef.current.length })
    },
    [refreshFromCollaboration]
  )

  const applyInspectorChange = (nextWorkflow: EditorWorkflow) => {
    applyLocalChange(nextWorkflow)
  }

  const createBlock = async (type: string) => {
    if (!workflowRef.current || workflowRef.current.locked) return
    setError(null)
    try {
      const template = await loadEditorBlockTemplate(type)
      if (!template) throw new Error('This block requires the advanced editor')
      const currentWorkflow = workflowRef.current
      if (!currentWorkflow || currentWorkflow.locked) return
      const blockId = `block-${generateId()}`
      const index = Object.keys(currentWorkflow.state.blocks).length
      const nextWorkflow = addEditorBlock(currentWorkflow, template, blockId, {
        x: 80 + (index % 4) * 260,
        y: 80 + Math.floor(index / 4) * 130,
      })
      applyLocalChange(nextWorkflow)
      setSelectedBlockId(blockId)
      setCatalogOpen(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to create block')
    }
  }

  const createContainer = (kind: EditorContainerKind) => {
    const currentWorkflow = workflowRef.current
    if (!currentWorkflow || currentWorkflow.locked) return
    try {
      const blockId = `${kind}-${generateId()}`
      const count = Object.values(currentWorkflow.state.blocks).filter(
        (block) => block.type === 'loop' || block.type === 'parallel'
      ).length
      const nextWorkflow = addEditorContainer(currentWorkflow, kind, blockId, {
        x: 80 + (count % 3) * 560,
        y: 180 + Math.floor(count / 3) * 360,
      })
      applyLocalChange(nextWorkflow)
      setSelectedBlockId(blockId)
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to create container')
    }
  }

  if (error && !workflow) {
    return (
      <main className='workspace-error'>
        <div>
          <h1>Workflow could not be loaded</h1>
          <p>{error}</p>
          <a href={legacyEditorHref(nextOrigin, workspaceId, workflowId)}>Open Next editor</a>
        </div>
      </main>
    )
  }

  return (
    <main className='editor-shell' data-editor-ready={workflow ? 'true' : 'false'}>
      <header className='editor-toolbar'>
        <a className='brand' href={`/workspace/${encodeURIComponent(workspaceId)}/home`}>
          sim
        </a>
        <div className='editor-title'>
          <strong>{workflow?.name ?? 'Loading workflow…'}</strong>
          <span>{workflow?.locked ? 'Read only' : dirty ? 'Unsaved' : 'Saved'}</span>
        </div>
        <div className='editor-actions'>
          <Suspense fallback={<small>Live…</small>}>
            <EditorCollaborationBridge
              onAccessRevoked={(message) => {
                setError(message)
                setWorkflow((current) => (current ? { ...current, locked: true } : current))
              }}
              onOperationFailed={setError}
              onRemoteOperation={applyRemoteOperation}
              onRemoteState={refreshFromCollaboration}
              onRemoteCursor={(cursor, socketId) => {
                setRemoteCursors((current) => {
                  if (cursor) return { ...current, [socketId]: cursor }
                  const { [socketId]: _removed, ...remaining } = current
                  return remaining
                })
              }}
              onRemoteSelection={(selection, socketId) => {
                setRemoteSelections((current) => {
                  if (selection) return { ...current, [socketId]: selection }
                  const { [socketId]: _removed, ...remaining } = current
                  return remaining
                })
              }}
              onWorkflowUpdated={refreshFromCollaboration}
              workflowId={workflowId}
            />
          </Suspense>
          <button
            disabled={!workflow || workflow.locked || historyCounts.undo === 0}
            onClick={undo}
            title='Undo (Ctrl+Z)'
            type='button'
          >
            Undo
          </button>
          <button
            disabled={!workflow || workflow.locked || historyCounts.redo === 0}
            onClick={redo}
            title='Redo (Ctrl+Shift+Z)'
            type='button'
          >
            Redo
          </button>
          <button onClick={() => setCatalogOpen((current) => !current)} type='button'>
            Tool Catalog
          </button>
          <button
            disabled={!workflow || workflow.locked}
            onClick={() => createContainer('loop')}
            type='button'
          >
            Add Loop
          </button>
          <button
            disabled={!workflow || workflow.locked}
            onClick={() => createContainer('parallel')}
            type='button'
          >
            Add Parallel
          </button>
          <button onClick={() => setActivityOpen((current) => !current)} type='button'>
            Versions & runs
          </button>
          <button
            disabled={!workflow}
            onClick={() => setRunOpen((current) => !current)}
            type='button'
          >
            Run
          </button>
          <button
            disabled={!dirty || saving || workflow?.locked || pendingOperationCount > 0}
            onClick={() => void save()}
            type='button'
          >
            {saving
              ? 'Saving…'
              : pendingOperationCount > 0
                ? `Syncing ${pendingOperationCount}…`
                : 'Save changes'}
          </button>
          <a href={legacyEditorHref(nextOrigin, workspaceId, workflowId)}>Advanced editor</a>
        </div>
      </header>
      {error ? <div className='editor-error'>{error}</div> : null}
      <section
        className='editor-stage'
        aria-label='Workflow canvas'
        onPointerLeave={() => {
          window.dispatchEvent(new CustomEvent('sim-vite-editor-cursor', { detail: null }))
        }}
        onPointerMove={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect()
          window.dispatchEvent(
            new CustomEvent('sim-vite-editor-cursor', {
              detail: {
                x: Math.round(event.clientX - bounds.left + event.currentTarget.scrollLeft),
                y: Math.round(event.clientY - bounds.top + event.currentTarget.scrollTop),
              },
            })
          )
        }}
      >
        <div className='editor-grid' />
        <svg aria-hidden='true' className='editor-edges'>
          {workflow?.state.edges.map((edge) => {
            const source = blockById[edge.source]
            const target = blockById[edge.target]
            if (!source || !target) return null
            const sourcePosition = editorBlockPosition(workflow, source.id)
            const targetPosition = editorBlockPosition(workflow, target.id)
            const sourceWidth = source.data?.width ?? NODE_WIDTH
            const sourceHeight = source.data?.height ?? NODE_HEIGHT
            const targetHeight = target.data?.height ?? NODE_HEIGHT
            const x1 = sourcePosition.x + sourceWidth
            const y1 = sourcePosition.y + sourceHeight / 2
            const x2 = targetPosition.x
            const y2 = targetPosition.y + targetHeight / 2
            const bend = Math.max(60, Math.abs(x2 - x1) / 2)
            return (
              <path
                className={edge.animated ? 'animated' : undefined}
                d={`M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`}
                key={edge.id}
              />
            )
          })}
        </svg>
        <div className='editor-nodes'>
          {blocks.map((block) => {
            const position = workflow ? editorBlockPosition(workflow, block.id) : block.position
            const isContainer = block.type === 'loop' || block.type === 'parallel'
            const selectedRemotely = Object.values(remoteSelections).some(
              (selection) => selection.blockId === block.id
            )
            return (
              <button
                aria-pressed={selectedBlockId === block.id}
                className={`${block.enabled ? 'editor-node' : 'editor-node disabled'}${isContainer ? ' container' : ''}${selectedRemotely ? ' remote-selected' : ''}`}
                data-block-id={block.id}
                key={block.id}
                onPointerCancel={finishDrag}
                onPointerDown={(event) => startDrag(event, block)}
                onPointerMove={drag}
                onPointerUp={finishDrag}
                style={
                  {
                    '--node-x': `${position.x}px`,
                    '--node-y': `${position.y}px`,
                    '--node-width': `${block.data?.width ?? NODE_WIDTH}px`,
                    '--node-height': `${block.data?.height ?? NODE_HEIGHT}px`,
                  } as CSSProperties
                }
                type='button'
              >
                <span>{block.type.replaceAll('_', ' ')}</span>
                <strong>{block.name}</strong>
              </button>
            )
          })}
        </div>
        <div aria-hidden='true' className='editor-remote-cursors'>
          {Object.values(remoteCursors).map((cursor) => (
            <div
              className='editor-remote-cursor'
              key={cursor.socketId}
              style={
                {
                  '--cursor-x': `${cursor.x}px`,
                  '--cursor-y': `${cursor.y}px`,
                } as CSSProperties
              }
            >
              <span>{cursor.userName}</span>
            </div>
          ))}
        </div>
        {!workflow ? <div className='editor-loading'>Loading minimal canvas…</div> : null}
        {workflow && blocks.length === 0 ? (
          <div className='editor-loading'>This workflow has no blocks.</div>
        ) : null}
      </section>
      {catalogOpen ? (
        <Suspense fallback={<div className='catalog-loading'>Loading Tool Catalog…</div>}>
          <ToolCatalogPanel
            creationDisabled={!workflow || workflow.locked}
            onAdvanced={() => {
              window.location.assign(legacyEditorHref(nextOrigin, workspaceId, workflowId))
            }}
            onClose={() => setCatalogOpen(false)}
            onCreate={(type) => void createBlock(type)}
          />
        </Suspense>
      ) : null}
      {activityOpen ? (
        <Suspense fallback={<div className='catalog-loading'>Loading workflow activity…</div>}>
          <EditorActivityPanel
            changesPending={dirty}
            onClose={() => setActivityOpen(false)}
            onWorkflowChanged={refreshFromCollaboration}
            workflowId={workflowId}
            workspaceId={workspaceId}
          />
        </Suspense>
      ) : null}
      {runOpen && workflow ? (
        <Suspense fallback={<div className='catalog-loading'>Loading workflow runner…</div>}>
          <EditorRunPanel
            changesPending={dirty}
            nextOrigin={nextOrigin}
            onClose={() => setRunOpen(false)}
            selectedBlockId={selectedBlockId}
            workflow={workflow}
          />
        </Suspense>
      ) : null}
      {workflow && selectedBlockId && workflow.state.blocks[selectedBlockId] ? (
        <Suspense fallback={<div className='inspector-loading'>Loading inspector…</div>}>
          <EditorInspector
            blockId={selectedBlockId}
            nextOrigin={nextOrigin}
            onChange={applyInspectorChange}
            onClose={() => {
              setSelectedBlockId(null)
              window.dispatchEvent(
                new CustomEvent('sim-vite-editor-selection', { detail: { type: 'none' } })
              )
            }}
            onError={setError}
            workflow={workflow}
            workspaceId={workspaceId}
          />
        </Suspense>
      ) : null}
    </main>
  )
}

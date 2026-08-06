import { type ChangeEvent, lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { generateId } from '@sim/utils/id'
import type { EditorWorkflow } from './editor-api'
import {
  connectEditorBlocks,
  type EditorContainerPatch,
  removeEditorBlock,
  removeEditorEdge,
  setEditorBlockParent,
  updateEditorBlock,
  updateEditorContainer,
} from './editor-state'
import { legacyEditorHref } from './runtime-links'

const EditorBasicFields = lazy(() =>
  import('./editor-basic-fields').then((module) => ({ default: module.EditorBasicFields }))
)

interface EditorInspectorProps {
  blockId: string
  nextOrigin: string
  onChange: (workflow: EditorWorkflow) => void
  onClose: () => void
  onError: (message: string | null) => void
  workflow: EditorWorkflow
  workspaceId: string
}

export function EditorInspector({
  blockId,
  nextOrigin,
  onChange,
  onClose,
  onError,
  workflow,
  workspaceId,
}: EditorInspectorProps) {
  const block = workflow.state.blocks[blockId]
  const [name, setName] = useState(block?.name ?? '')
  const [targetId, setTargetId] = useState('')
  const [fieldsOpen, setFieldsOpen] = useState(false)
  const [fieldMode, setFieldMode] = useState<'advanced' | 'basic'>('basic')
  const connections = useMemo(
    () => workflow.state.edges.filter((edge) => edge.source === blockId || edge.target === blockId),
    [blockId, workflow.state.edges]
  )
  const targets = useMemo(
    () => Object.values(workflow.state.blocks).filter((candidate) => candidate.id !== blockId),
    [blockId, workflow.state.blocks]
  )
  const containers = useMemo(
    () =>
      Object.values(workflow.state.blocks).filter(
        (candidate) =>
          candidate.id !== blockId && (candidate.type === 'loop' || candidate.type === 'parallel')
      ),
    [blockId, workflow.state.blocks]
  )

  useEffect(() => {
    setName(block?.name ?? '')
  }, [block?.name])

  if (!block) return null

  const mutate = (operation: () => EditorWorkflow) => {
    try {
      onChange(operation())
      onError(null)
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : 'Unable to update workflow')
    }
  }

  const rename = () => {
    if (name.trim() === block.name) return
    mutate(() => updateEditorBlock(workflow, blockId, { name }))
  }

  const toggleEnabled = (event: ChangeEvent<HTMLInputElement>) => {
    mutate(() => updateEditorBlock(workflow, blockId, { enabled: event.target.checked }))
  }

  const connect = () => {
    if (!targetId) return
    mutate(() => connectEditorBlocks(workflow, blockId, targetId, `edge-${generateId()}`))
    setTargetId('')
  }

  const remove = () => {
    if (!globalThis.confirm(`Delete "${block.name}" and its connections?`)) return
    try {
      onChange(removeEditorBlock(workflow, blockId))
      onClose()
      onError(null)
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : 'Unable to delete block')
    }
  }

  const updateContainer = (patch: EditorContainerPatch) => {
    mutate(() => updateEditorContainer(workflow, blockId, patch))
  }

  const containerType = block.type === 'loop' || block.type === 'parallel' ? block.type : null
  const currentParent =
    typeof block.parentId === 'string'
      ? block.parentId
      : typeof block.data?.parentId === 'string'
        ? block.data.parentId
        : ''
  const count = typeof block.data?.count === 'number' ? block.data.count : 5
  const collection = typeof block.data?.collection === 'string' ? block.data.collection : ''
  const loopType = typeof block.data?.loopType === 'string' ? block.data.loopType : 'for'
  const parallelType =
    typeof block.data?.parallelType === 'string' ? block.data.parallelType : 'count'

  return (
    <aside aria-label='Block inspector' className='editor-inspector'>
      <header>
        <div>
          <strong>{block.name}</strong>
          <small>{block.type.replaceAll('_', ' ')}</small>
        </div>
        <button aria-label='Close block inspector' onClick={onClose} type='button'>
          ×
        </button>
      </header>
      <label>
        Name
        <input
          disabled={workflow.locked || block.locked === true}
          onBlur={rename}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
          value={name}
        />
      </label>
      <label className='editor-toggle'>
        <input
          checked={block.enabled}
          disabled={workflow.locked || block.locked === true}
          onChange={toggleEnabled}
          type='checkbox'
        />
        Enabled
      </label>
      {containerType ? (
        <section className='editor-container-fields'>
          <strong>{containerType === 'loop' ? 'Loop settings' : 'Parallel settings'}</strong>
          {containerType === 'loop' ? (
            <label>
              Loop mode
              <select
                disabled={workflow.locked || block.locked === true}
                onChange={(event) =>
                  updateContainer({
                    loopType: event.target.value as EditorContainerPatch['loopType'],
                  })
                }
                value={loopType}
              >
                <option value='for'>Fixed count</option>
                <option value='forEach'>Collection</option>
                <option value='while'>While</option>
                <option value='doWhile'>Do while</option>
              </select>
            </label>
          ) : (
            <label>
              Parallel mode
              <select
                disabled={workflow.locked || block.locked === true}
                onChange={(event) =>
                  updateContainer({
                    parallelType: event.target.value as EditorContainerPatch['parallelType'],
                  })
                }
                value={parallelType}
              >
                <option value='count'>Fixed count</option>
                <option value='collection'>Collection</option>
              </select>
            </label>
          )}
          {(containerType === 'loop' ? loopType === 'for' : parallelType === 'count') ? (
            <label>
              Count
              <input
                disabled={workflow.locked || block.locked === true}
                min='1'
                onChange={(event) => updateContainer({ count: Number(event.target.value) })}
                type='number'
                value={count}
              />
            </label>
          ) : null}
          {containerType === 'loop' && (loopType === 'while' || loopType === 'doWhile') ? (
            <label>
              Condition
              <textarea
                disabled={workflow.locked || block.locked === true}
                onChange={(event) =>
                  updateContainer(
                    loopType === 'while'
                      ? { whileCondition: event.target.value }
                      : { doWhileCondition: event.target.value }
                  )
                }
                value={
                  loopType === 'while'
                    ? String(block.data?.whileCondition ?? '')
                    : String(block.data?.doWhileCondition ?? '')
                }
              />
            </label>
          ) : null}
          {(containerType === 'loop' ? loopType === 'forEach' : parallelType === 'collection') ? (
            <label>
              Collection expression
              <textarea
                disabled={workflow.locked || block.locked === true}
                onChange={(event) => updateContainer({ collection: event.target.value })}
                value={collection}
              />
            </label>
          ) : null}
          {containerType === 'parallel' && parallelType === 'collection' ? (
            <label>
              Batch size
              <input
                disabled={workflow.locked || block.locked === true}
                max='20'
                min='1'
                onChange={(event) => updateContainer({ batchSize: Number(event.target.value) })}
                type='number'
                value={typeof block.data?.batchSize === 'number' ? block.data.batchSize : 20}
              />
            </label>
          ) : null}
        </section>
      ) : null}
      <label>
        Parent container
        <select
          disabled={workflow.locked || block.locked === true}
          onChange={(event) =>
            mutate(() => setEditorBlockParent(workflow, blockId, event.target.value || null))
          }
          value={currentParent}
        >
          <option value=''>Canvas root</option>
          {containers.map((container) => (
            <option key={container.id} value={container.id}>
              {container.name}
            </option>
          ))}
        </select>
      </label>
      <section>
        <div className='editor-config-actions'>
          <button onClick={() => setFieldsOpen((current) => !current)} type='button'>
            {fieldsOpen ? 'Hide configuration' : 'Load configuration'}
          </button>
          {fieldsOpen ? (
            <select
              aria-label='Configuration mode'
              onChange={(event) =>
                setFieldMode(event.target.value === 'advanced' ? 'advanced' : 'basic')
              }
              value={fieldMode}
            >
              <option value='basic'>Basic</option>
              <option value='advanced'>Advanced</option>
            </select>
          ) : null}
        </div>
        {fieldsOpen ? (
          <Suspense fallback={<small>Loading configuration…</small>}>
            <EditorBasicFields
              blockId={blockId}
              mode={fieldMode}
              onChange={onChange}
              onError={onError}
              workflow={workflow}
            />
          </Suspense>
        ) : null}
      </section>
      <section>
        <strong>Connect to</strong>
        <div className='editor-connect'>
          <select
            aria-label='Connection target'
            disabled={workflow.locked || block.locked === true}
            onChange={(event) => setTargetId(event.target.value)}
            value={targetId}
          >
            <option value=''>Select block…</option>
            {targets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.name}
              </option>
            ))}
          </select>
          <button
            disabled={!targetId || workflow.locked || block.locked === true}
            onClick={connect}
            type='button'
          >
            Connect
          </button>
        </div>
      </section>
      <section>
        <strong>Connections</strong>
        {connections.length === 0 ? <small>No connections</small> : null}
        {connections.map((edge) => {
          const incoming = edge.target === blockId
          const other = workflow.state.blocks[incoming ? edge.source : edge.target]
          return (
            <div className='editor-connection' key={edge.id}>
              <span>
                {incoming ? '←' : '→'} {other?.name ?? 'Missing block'}
              </span>
              <button
                aria-label={`Remove connection ${edge.id}`}
                disabled={
                  workflow.locked ||
                  block.locked === true ||
                  workflow.state.blocks[edge.source]?.locked === true ||
                  workflow.state.blocks[edge.target]?.locked === true
                }
                onClick={() => mutate(() => removeEditorEdge(workflow, edge.id))}
                type='button'
              >
                Remove
              </button>
            </div>
          )
        })}
      </section>
      <p>
        Dynamic resource pickers use a manual ID fallback in Vite. Open the compatibility editor
        only for provider-specific assisted pickers or visual builders.
      </p>
      <a href={legacyEditorHref(nextOrigin, workspaceId, workflow.id)}>Open compatibility editor</a>
      <button
        className='editor-delete'
        disabled={workflow.locked || block.locked === true}
        onClick={remove}
        type='button'
      >
        Delete block
      </button>
    </aside>
  )
}

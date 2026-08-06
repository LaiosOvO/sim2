import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { EditorWorkflow } from './editor-api'

const EditorPauseForm = lazy(() =>
  import('./editor-pause-form').then((module) => ({ default: module.EditorPauseForm }))
)

interface ExecutionEvent {
  data?: unknown
  executionId?: string
  type: string
}

interface PausePointSummary {
  blockId?: string
  contextId: string
  resumeStatus: string
}

interface EditorRunPanelProps {
  changesPending: boolean
  nextOrigin: string
  onClose: () => void
  selectedBlockId: string | null
  workflow: EditorWorkflow
}

export function takeSseEvents(buffer: string): {
  events: ExecutionEvent[]
  rest: string
} {
  const normalized = buffer.replaceAll('\r\n', '\n')
  const frames = normalized.split('\n\n')
  const rest = frames.pop() ?? ''
  const events = frames.flatMap((frame): ExecutionEvent[] => {
    const data = frame
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
    if (!data) return []
    try {
      const value = JSON.parse(data) as unknown
      if (!value || typeof value !== 'object' || Array.isArray(value)) return []
      const record = value as Record<string, unknown>
      if (typeof record.type !== 'string') return []
      return [
        {
          type: record.type,
          data: record.data,
          ...(typeof record.executionId === 'string' ? { executionId: record.executionId } : {}),
        },
      ]
    } catch {
      return []
    }
  })
  return { events, rest }
}

function eventLabel(event: ExecutionEvent): string {
  if (!event.data || typeof event.data !== 'object' || Array.isArray(event.data)) return event.type
  const data = event.data as Record<string, unknown>
  const blockId = typeof data.blockId === 'string' ? ` · ${data.blockId}` : ''
  const message =
    typeof data.error === 'string'
      ? ` · ${data.error}`
      : typeof data.message === 'string'
        ? ` · ${data.message}`
        : ''
  return `${event.type}${blockId}${message}`
}

export function EditorRunPanel({
  changesPending,
  nextOrigin,
  onClose,
  selectedBlockId,
  workflow,
}: EditorRunPanelProps) {
  const [input, setInput] = useState('{}')
  const [events, setEvents] = useState<ExecutionEvent[]>([])
  const [status, setStatus] = useState<
    'cancelled' | 'cancelling' | 'completed' | 'error' | 'idle' | 'paused' | 'resuming' | 'running'
  >('idle')
  const [error, setError] = useState<string | null>(null)
  const [executionId, setExecutionId] = useState<string | null>(null)
  const [pausePoints, setPausePoints] = useState<PausePointSummary[]>([])
  const cancellationRef = useRef(false)
  const controllerRef = useRef<AbortController | null>(null)
  const executionBusy = status === 'running' || status === 'cancelling' || status === 'resuming'

  useEffect(() => () => controllerRef.current?.abort(), [])

  useEffect(() => {
    if (status !== 'paused' || !executionId) return
    const controller = new AbortController()
    void fetch(
      `/api/resume/${encodeURIComponent(workflow.id)}/${encodeURIComponent(executionId)}`,
      { credentials: 'include', signal: controller.signal }
    )
      .then(async (response) => {
        if (!response.ok) throw new Error(`Unable to load pause points: ${response.status}`)
        return response.json() as Promise<Record<string, unknown>>
      })
      .then((payload) => {
        const points = Array.isArray(payload.pausePoints) ? payload.pausePoints : []
        setPausePoints(
          points.flatMap((point): PausePointSummary[] => {
            if (!point || typeof point !== 'object' || Array.isArray(point)) return []
            const record = point as Record<string, unknown>
            if (typeof record.contextId !== 'string') return []
            return [
              {
                contextId: record.contextId,
                resumeStatus:
                  typeof record.resumeStatus === 'string' ? record.resumeStatus : 'paused',
                ...(typeof record.blockId === 'string' ? { blockId: record.blockId } : {}),
              },
            ]
          })
        )
      })
      .catch((caught) => {
        if (!controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : 'Unable to load pause points')
        }
      })
    return () => controller.abort()
  }, [executionId, status, workflow.id])

  const run = async (mode: 'full' | 'resume-from-selected' | 'until-selected') => {
    if (changesPending) {
      setError('Save workflow changes before running the workflow.')
      return
    }
    if (mode !== 'full' && !selectedBlockId) {
      setError('Select a block before using block-level execution.')
      return
    }
    let parsedInput: unknown
    try {
      parsedInput = JSON.parse(input)
    } catch {
      setError('Run input must be valid JSON.')
      return
    }

    const controller = new AbortController()
    controllerRef.current?.abort()
    controllerRef.current = controller
    setEvents([])
    setPausePoints([])
    setExecutionId(null)
    cancellationRef.current = false
    setError(null)
    setStatus('running')

    try {
      const blocks = Object.fromEntries(
        Object.entries(workflow.state.blocks).filter(([, block]) => block.enabled !== false)
      )
      const requestBody =
        mode === 'resume-from-selected'
          ? {
              stream: true,
              input: parsedInput,
              runFromBlock: { startBlockId: selectedBlockId, executionId: 'latest' },
            }
          : {
              stream: true,
              input: parsedInput,
              triggerType: 'manual',
              useDraftState: true,
              isClientSession: true,
              ...(mode === 'until-selected' ? { stopAfterBlockId: selectedBlockId } : {}),
              workflowStateOverride: {
                blocks,
                edges: workflow.state.edges,
                loops: workflow.state.loops ?? {},
                parallels: workflow.state.parallels ?? {},
              },
            }
      const response = await fetch(`/api/workflows/${encodeURIComponent(workflow.id)}/execute`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      })
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null
        throw new Error(
          typeof payload?.error === 'string'
            ? payload.error
            : `Unable to run workflow: ${response.status}`
        )
      }
      if (!response.body) throw new Error('Execution stream is unavailable')
      const headerExecutionId = response.headers.get('X-Execution-Id')
      if (headerExecutionId) setExecutionId(headerExecutionId)

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let pending = ''
      let terminalStatus: 'cancelled' | 'completed' | 'error' | 'paused' | null = null
      while (true) {
        const { value, done } = await reader.read()
        pending += decoder.decode(value, { stream: !done })
        const parsed = takeSseEvents(pending)
        pending = parsed.rest
        if (parsed.events.length > 0) {
          setEvents((current) => [...current, ...parsed.events].slice(-100))
          for (const event of parsed.events) {
            if (event.executionId) setExecutionId(event.executionId)
            if (event.type === 'execution:completed') terminalStatus = 'completed'
            if (event.type === 'execution:paused') terminalStatus = 'paused'
            if (event.type === 'execution:error') terminalStatus = 'error'
            if (event.type === 'execution:cancelled') terminalStatus = 'cancelled'
          }
        }
        if (done) break
      }
      setStatus(terminalStatus ?? 'completed')
    } catch (caught) {
      if (controller.signal.aborted && cancellationRef.current) {
        return
      }
      if (controller.signal.aborted) {
        setError('Execution stopped.')
      } else {
        setError(caught instanceof Error ? caught.message : 'Unable to run workflow')
      }
      setStatus('error')
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }

  const cancel = async () => {
    const currentExecutionId = executionId
    if (!currentExecutionId) {
      controllerRef.current?.abort()
      setStatus('cancelled')
      setError('The stream stopped before an execution ID was available.')
      return
    }
    setStatus('cancelling')
    cancellationRef.current = true
    setError(null)
    try {
      const response = await fetch(
        `/api/workflows/${encodeURIComponent(workflow.id)}/executions/${encodeURIComponent(currentExecutionId)}/cancel`,
        { method: 'POST', credentials: 'include' }
      )
      const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null
      if (!response.ok || payload?.success !== true) {
        throw new Error(
          typeof payload?.error === 'string'
            ? payload.error
            : typeof payload?.reason === 'string'
              ? `Unable to cancel execution: ${payload.reason}`
              : `Unable to cancel execution: ${response.status}`
        )
      }
      controllerRef.current?.abort()
      setStatus('cancelled')
    } catch (caught) {
      cancellationRef.current = false
      setStatus('error')
      setError(caught instanceof Error ? caught.message : 'Unable to cancel execution')
    }
  }

  return (
    <aside aria-label='Run workflow' className='editor-run-panel'>
      <header>
        <div>
          <strong>Run workflow</strong>
          <small>Draft execution is streamed from the Node API</small>
        </div>
        <button aria-label='Close workflow runner' onClick={onClose} type='button'>
          ×
        </button>
      </header>
      <label>
        Input JSON
        <textarea
          disabled={executionBusy}
          onChange={(event) => setInput(event.target.value)}
          value={input}
        />
      </label>
      <div className='editor-run-actions'>
        <button
          disabled={changesPending || executionBusy}
          onClick={() => void run('full')}
          type='button'
        >
          Run
        </button>
        <button
          disabled={changesPending || executionBusy || !selectedBlockId}
          onClick={() => void run('until-selected')}
          type='button'
        >
          Run to selected
        </button>
        <button
          disabled={changesPending || executionBusy || !selectedBlockId}
          onClick={() => void run('resume-from-selected')}
          type='button'
        >
          Resume selected
        </button>
        <button disabled={status !== 'running'} onClick={() => void cancel()} type='button'>
          Stop
        </button>
        <small>
          {status}
          {executionId ? ` · ${executionId}` : ''}
        </small>
      </div>
      <small>
        {selectedBlockId
          ? `Selected block: ${workflow.state.blocks[selectedBlockId]?.name ?? selectedBlockId}`
          : 'Select a block to enable block-level execution.'}
      </small>
      {changesPending ? <small>Save pending changes before running.</small> : null}
      {(status === 'paused' || status === 'resuming') && executionId ? (
        <section className='editor-pause-points'>
          <strong>Paused contexts</strong>
          {pausePoints.length === 0 ? <small>Loading pause details…</small> : null}
          {pausePoints.map((point) => (
            <div key={point.contextId}>
              <small>
                {point.blockId ?? point.contextId} · {point.resumeStatus}
              </small>
              {point.resumeStatus === 'paused' ? (
                <Suspense fallback={<small>Loading resume form…</small>}>
                  <EditorPauseForm
                    contextId={point.contextId}
                    disabled={status === 'resuming'}
                    executionId={executionId}
                    onError={setError}
                    onResumed={(nextStatus) => {
                      setPausePoints((current) =>
                        current.map((candidate) =>
                          candidate.contextId === point.contextId
                            ? { ...candidate, resumeStatus: nextStatus }
                            : candidate
                        )
                      )
                      setStatus('resuming')
                    }}
                    workflowId={workflow.id}
                  />
                </Suspense>
              ) : null}
            </div>
          ))}
          <a
            href={`${nextOrigin.replace(/\/$/, '')}/resume/${encodeURIComponent(workflow.id)}/${encodeURIComponent(executionId)}`}
          >
            Open structured resume form
          </a>
        </section>
      ) : null}
      {error ? <p>{error}</p> : null}
      <section>
        <strong>Execution events</strong>
        {events.length === 0 ? <small>No events yet</small> : null}
        <ol>
          {events.map((event, index) => (
            <li key={`${event.type}-${index}`}>{eventLabel(event)}</li>
          ))}
        </ol>
      </section>
    </aside>
  )
}

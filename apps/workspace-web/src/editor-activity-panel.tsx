import { useCallback, useEffect, useState } from 'react'

interface DeploymentVersion {
  createdAt: string
  deployedBy?: string | null
  id: string
  isActive: boolean
  name?: string | null
  version: number
}

interface ExecutionLog {
  createdAt: string
  duration: string | null
  executionId: string | null
  id: string
  status: string | null
  trigger: string | null
}

interface EditorActivityPanelProps {
  changesPending: boolean
  onClose: () => void
  onWorkflowChanged: () => void
  workflowId: string
  workspaceId: string
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  if (!response.ok) throw new Error(`Request failed: ${response.status}`)
  const value = (await response.json()) as unknown
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Response is invalid')
  }
  return value as Record<string, unknown>
}

export function EditorActivityPanel({
  changesPending,
  onClose,
  onWorkflowChanged,
  workflowId,
  workspaceId,
}: EditorActivityPanelProps) {
  const [versions, setVersions] = useState<DeploymentVersion[]>([])
  const [logs, setLogs] = useState<ExecutionLog[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null)
  const [mutating, setMutating] = useState(false)
  const [deployed, setDeployed] = useState(false)

  const inspectLog = async (logId: string) => {
    setError(null)
    try {
      const payload = await fetch(
        `/api/logs/${encodeURIComponent(logId)}?workspaceId=${encodeURIComponent(workspaceId)}`,
        { credentials: 'include' }
      ).then(responseJson)
      setDetail(
        payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
          ? (payload.data as Record<string, unknown>)
          : payload
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load run detail')
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const query = new URLSearchParams({
        workspaceId,
        workflowIds: workflowId,
        limit: '20',
        sortBy: 'date',
        sortOrder: 'desc',
      })
      const [deploymentPayload, deploymentInfo, logsPayload] = await Promise.all([
        fetch(`/api/workflows/${encodeURIComponent(workflowId)}/deployments`, {
          credentials: 'include',
        }).then(responseJson),
        fetch(`/api/workflows/${encodeURIComponent(workflowId)}/deploy`, {
          credentials: 'include',
        }).then(responseJson),
        fetch(`/api/logs?${query}`, { credentials: 'include' }).then(responseJson),
      ])
      setVersions(
        Array.isArray(deploymentPayload.versions)
          ? (deploymentPayload.versions as DeploymentVersion[])
          : []
      )
      setDeployed(deploymentInfo.isDeployed === true)
      setLogs(Array.isArray(logsPayload.data) ? (logsPayload.data as ExecutionLog[]) : [])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load workflow activity')
    } finally {
      setLoading(false)
    }
  }, [workflowId, workspaceId])

  const changeDeployment = async () => {
    if (changesPending) {
      setError('Save workflow changes before deploying or undeploying.')
      return
    }
    const action = deployed ? 'undeploy' : 'deploy'
    if (!globalThis.confirm(`${deployed ? 'Undeploy' : 'Deploy'} this workflow?`)) return
    setMutating(true)
    setError(null)
    try {
      const payload = await fetch(`/api/workflows/${encodeURIComponent(workflowId)}/deploy`, {
        method: deployed ? 'DELETE' : 'POST',
        credentials: 'include',
      }).then(responseJson)
      setDeployed(payload.isDeployed === true)
      onWorkflowChanged()
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Unable to ${action} workflow`)
    } finally {
      setMutating(false)
    }
  }

  const restoreVersion = async (version: DeploymentVersion) => {
    if (!globalThis.confirm(`Restore workflow state from deployment v${version.version}?`)) return
    setMutating(true)
    setError(null)
    try {
      await fetch(
        `/api/workflows/${encodeURIComponent(workflowId)}/deployments/${version.version}/revert`,
        { method: 'POST', credentials: 'include' }
      ).then(responseJson)
      onWorkflowChanged()
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to restore deployment version')
    } finally {
      setMutating(false)
    }
  }

  useEffect(() => {
    void load()
  }, [load])

  return (
    <aside aria-label='Workflow activity' className='editor-activity-panel'>
      <header>
        <div>
          <strong>Versions & runs</strong>
          <small>Loaded on demand</small>
        </div>
        <button aria-label='Close workflow activity' onClick={onClose} type='button'>
          ×
        </button>
      </header>
      <div className='editor-activity-actions'>
        <button disabled={loading} onClick={() => void load()} type='button'>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        <button
          disabled={loading || mutating || changesPending}
          onClick={() => void changeDeployment()}
          type='button'
        >
          {mutating ? 'Updating…' : deployed ? 'Undeploy' : 'Deploy'}
        </button>
      </div>
      {changesPending ? <small>Save pending changes before deployment.</small> : null}
      {error ? <p className='editor-error'>{error}</p> : null}
      <section>
        <strong>Deployment versions</strong>
        {versions.length === 0 && !loading ? <small>No deployment versions</small> : null}
        {versions.map((version) => (
          <article key={version.id}>
            <span>v{version.version}</span>
            <div>
              <strong>{version.name || 'Unnamed deployment'}</strong>
              <small>
                {version.isActive ? 'Active · ' : ''}
                {new Date(version.createdAt).toLocaleString()}
              </small>
            </div>
            <button disabled={mutating} onClick={() => void restoreVersion(version)} type='button'>
              Restore
            </button>
          </article>
        ))}
      </section>
      <section>
        <strong>Recent runs</strong>
        {logs.length === 0 && !loading ? <small>No recent runs</small> : null}
        {logs.map((log) => (
          <article key={log.id}>
            <span>{log.status || 'unknown'}</span>
            <div>
              <strong>{log.trigger || 'manual'}</strong>
              <small>
                {new Date(log.createdAt).toLocaleString()}
                {log.duration ? ` · ${log.duration}` : ''}
              </small>
            </div>
            <button onClick={() => void inspectLog(log.id)} type='button'>
              Inspect
            </button>
          </article>
        ))}
      </section>
      {detail ? (
        <section>
          <div className='editor-detail-heading'>
            <strong>Run detail</strong>
            <button onClick={() => setDetail(null)} type='button'>
              Close
            </button>
          </div>
          <pre>{JSON.stringify(detail, null, 2)}</pre>
        </section>
      ) : null}
    </aside>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { generateId } from '@sim/utils/id'

interface PresenceUser {
  socketId: string
  userId: string
  userName: string
}

export interface RemoteCursor {
  socketId: string
  userName: string
  x: number
  y: number
}

export interface RemoteSelection {
  blockId: string | null
  socketId: string
  userName: string
}

interface CollaborationOptions {
  onAccessRevoked: (message: string) => void
  onOperationFailed?: (message: string) => void
  onRemoteOperation?: (operation: unknown) => void
  onRemoteState: (state: unknown) => void
  onRemoteCursor?: (cursor: RemoteCursor | null, socketId: string) => void
  onRemoteSelection?: (selection: RemoteSelection | null, socketId: string) => void
  onWorkflowUpdated: () => void
  workflowId: string
}

interface EditorCollaborationBridgeProps extends CollaborationOptions {}

export function useEditorCollaboration({
  onAccessRevoked,
  onOperationFailed,
  onRemoteOperation,
  onRemoteState,
  onRemoteCursor,
  onRemoteSelection,
  onWorkflowUpdated,
  workflowId,
}: CollaborationOptions) {
  const [status, setStatus] = useState<'connected' | 'connecting' | 'offline'>('connecting')
  const [presence, setPresence] = useState<PresenceUser[]>([])
  const socketRef = useRef<import('socket.io-client').Socket | null>(null)
  const callbacks = useRef({
    onAccessRevoked,
    onOperationFailed,
    onRemoteOperation,
    onRemoteCursor,
    onRemoteSelection,
    onRemoteState,
    onWorkflowUpdated,
  })
  callbacks.current = {
    onAccessRevoked,
    onOperationFailed,
    onRemoteOperation,
    onRemoteCursor,
    onRemoteSelection,
    onRemoteState,
    onWorkflowUpdated,
  }

  useEffect(() => {
    let active = true
    let socket: import('socket.io-client').Socket | null = null
    let cursorFrame = 0
    let pendingCursor: { x: number; y: number } | null = null
    const remoteSocketIds = new Set<string>()
    const tabSessionId = sessionStorage.getItem('sim-vite-editor-tab') ?? generateId()
    sessionStorage.setItem('sim-vite-editor-tab', tabSessionId)

    const clearRemotePresence = () => {
      for (const socketId of remoteSocketIds) {
        callbacks.current.onRemoteCursor?.(null, socketId)
        callbacks.current.onRemoteSelection?.(null, socketId)
      }
      remoteSocketIds.clear()
    }

    const publishCursor = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail
      if (detail === null) {
        socketRef.current?.emit('cursor-update', { cursor: null })
        return
      }
      if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return
      const record = detail as Record<string, unknown>
      if (typeof record.x !== 'number' || typeof record.y !== 'number') return
      pendingCursor = { x: record.x, y: record.y }
      if (cursorFrame) return
      cursorFrame = requestAnimationFrame(() => {
        cursorFrame = 0
        if (pendingCursor) socketRef.current?.emit('cursor-update', { cursor: pendingCursor })
      })
    }
    const publishSelection = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail
      if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return
      const record = detail as Record<string, unknown>
      const type = record.type === 'block' ? 'block' : 'none'
      socketRef.current?.emit('selection-update', {
        selection: {
          type,
          ...(type === 'block' && typeof record.id === 'string' ? { id: record.id } : {}),
        },
      })
    }
    const publishOperation = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail
      if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return
      const record = detail as Record<string, unknown>
      const operationId = typeof record.operationId === 'string' ? record.operationId : null
      if (!socketRef.current?.connected) {
        if (operationId) {
          window.dispatchEvent(
            new CustomEvent('sim-vite-editor-operation-settled', {
              detail: { operationId, persisted: false },
            })
          )
        }
        return
      }
      socketRef.current.emit('workflow-operation', detail)
    }
    window.addEventListener('sim-vite-editor-cursor', publishCursor)
    window.addEventListener('sim-vite-editor-operation', publishOperation)
    window.addEventListener('sim-vite-editor-selection', publishSelection)

    void import('socket.io-client').then(({ io }) => {
      if (!active) return
      socket = io({
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        withCredentials: true,
      })
      socketRef.current = socket
      socket.on('connect', () => {
        setStatus('connected')
        socket?.emit('join-workflow', { workflowId, tabSessionId })
      })
      socket.on('disconnect', () => {
        setStatus('offline')
        clearRemotePresence()
      })
      socket.io.on('reconnect_attempt', () => setStatus('connecting'))
      socket.on('presence-update', (users: unknown) => {
        if (!Array.isArray(users)) return
        const nextPresence = users.flatMap((user): PresenceUser[] => {
          if (!user || typeof user !== 'object' || Array.isArray(user)) return []
          const record = user as Record<string, unknown>
          if (
            typeof record.socketId !== 'string' ||
            typeof record.userId !== 'string' ||
            typeof record.userName !== 'string'
          ) {
            return []
          }
          return [{ socketId: record.socketId, userId: record.userId, userName: record.userName }]
        })
        const activeSocketIds = new Set(nextPresence.map((user) => user.socketId))
        for (const socketId of remoteSocketIds) {
          if (activeSocketIds.has(socketId)) continue
          callbacks.current.onRemoteCursor?.(null, socketId)
          callbacks.current.onRemoteSelection?.(null, socketId)
          remoteSocketIds.delete(socketId)
        }
        setPresence(nextPresence)
      })
      socket.on('cursor-update', (event: unknown) => {
        if (!event || typeof event !== 'object' || Array.isArray(event)) return
        const record = event as Record<string, unknown>
        if (typeof record.socketId !== 'string') return
        remoteSocketIds.add(record.socketId)
        if (record.cursor === null) {
          callbacks.current.onRemoteCursor?.(null, record.socketId)
          return
        }
        if (!record.cursor || typeof record.cursor !== 'object' || Array.isArray(record.cursor))
          return
        const cursor = record.cursor as Record<string, unknown>
        if (typeof cursor.x !== 'number' || typeof cursor.y !== 'number') return
        callbacks.current.onRemoteCursor?.(
          {
            socketId: record.socketId,
            userName: typeof record.userName === 'string' ? record.userName : 'Collaborator',
            x: cursor.x,
            y: cursor.y,
          },
          record.socketId
        )
      })
      socket.on('selection-update', (event: unknown) => {
        if (!event || typeof event !== 'object' || Array.isArray(event)) return
        const record = event as Record<string, unknown>
        if (
          typeof record.socketId !== 'string' ||
          !record.selection ||
          typeof record.selection !== 'object' ||
          Array.isArray(record.selection)
        ) {
          return
        }
        remoteSocketIds.add(record.socketId)
        const selection = record.selection as Record<string, unknown>
        callbacks.current.onRemoteSelection?.(
          {
            blockId:
              selection.type === 'block' && typeof selection.id === 'string' ? selection.id : null,
            socketId: record.socketId,
            userName: typeof record.userName === 'string' ? record.userName : 'Collaborator',
          },
          record.socketId
        )
      })
      socket.on('workflow-operation', (event: unknown) => {
        if (!event || typeof event !== 'object' || Array.isArray(event)) return
        const record = event as Record<string, unknown>
        const payload = record.payload
        if (
          record.operation === 'replace-state' &&
          payload &&
          typeof payload === 'object' &&
          !Array.isArray(payload) &&
          'state' in payload
        ) {
          callbacks.current.onRemoteState(payload.state)
        } else {
          callbacks.current.onRemoteOperation?.(event)
        }
      })
      socket.on('operation-failed', (event: unknown) => {
        const record =
          event && typeof event === 'object' && !Array.isArray(event)
            ? (event as Record<string, unknown>)
            : null
        callbacks.current.onOperationFailed?.(
          typeof record?.error === 'string'
            ? `Collaborative edit rejected: ${record.error}`
            : 'Collaborative edit could not be persisted'
        )
        if (typeof record?.operationId === 'string') {
          window.dispatchEvent(
            new CustomEvent('sim-vite-editor-operation-settled', {
              detail: { operationId: record.operationId, persisted: false },
            })
          )
        }
      })
      socket.on('operation-confirmed', (event: unknown) => {
        if (!event || typeof event !== 'object' || Array.isArray(event)) return
        const operationId = (event as Record<string, unknown>).operationId
        if (typeof operationId !== 'string') return
        window.dispatchEvent(
          new CustomEvent('sim-vite-editor-operation-settled', {
            detail: { operationId, persisted: true },
          })
        )
      })
      socket.on('workflow-updated', (event: unknown) => {
        if (!event || typeof event !== 'object' || Array.isArray(event)) return
        if ((event as Record<string, unknown>).workflowId === workflowId) {
          callbacks.current.onWorkflowUpdated()
        }
      })
      socket.on('access-revoked', (event: unknown) => {
        const message =
          event && typeof event === 'object' && !Array.isArray(event)
            ? (event as Record<string, unknown>).message
            : undefined
        callbacks.current.onAccessRevoked(
          typeof message === 'string' ? message : 'Workflow access was revoked'
        )
      })
      socket.on('join-workflow-error', () => setStatus('offline'))
    })

    return () => {
      active = false
      window.removeEventListener('sim-vite-editor-cursor', publishCursor)
      window.removeEventListener('sim-vite-editor-operation', publishOperation)
      window.removeEventListener('sim-vite-editor-selection', publishSelection)
      if (cursorFrame) cancelAnimationFrame(cursorFrame)
      clearRemotePresence()
      socket?.emit('leave-workflow')
      socket?.disconnect()
      socketRef.current = null
    }
  }, [workflowId])

  const publishState = useCallback((state: unknown) => {
    const socket = socketRef.current
    if (!socket?.connected) return false
    socket.emit('workflow-operation', {
      operation: 'replace-state',
      target: 'workflow',
      payload: { state },
      timestamp: Date.now(),
      operationId: generateId(),
    })
    return true
  }, [])

  return { presence, publishState, status }
}

export function EditorCollaborationBridge(props: EditorCollaborationBridgeProps) {
  const { presence, status } = useEditorCollaboration(props)
  const uniqueUsers = new Set(presence.map((user) => user.userId)).size
  return (
    <div
      className={`editor-presence ${status}`}
      title={presence.map((user) => user.userName).join(', ')}
    >
      <span>
        {status === 'connected' ? 'Live' : status === 'connecting' ? 'Connecting' : 'Offline'}
      </span>
      {status === 'connected' ? <small>{uniqueUsers} online</small> : null}
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'

export interface SessionPayload {
  user?: {
    id: string
    name?: string | null
    email?: string | null
  }
}

export interface WorkflowSummary {
  id: string
  name: string
  description?: string | null
  folderId?: string | null
  updatedAt?: string
  isDeployed?: boolean
}

export interface FolderSummary {
  id: string
  name: string
  parentId?: string | null
}

export interface ChatSummary {
  id: string
  title?: string | null
  updatedAt?: string
  pinned?: boolean
  activeStreamId?: string | null
}

export interface WorkspaceFileSummary {
  id: string
  name: string
  path?: string
  type?: string
  size?: number
  updatedAt?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export interface WorkspaceBootstrapPayload {
  session: SessionPayload
  workflows: WorkflowSummary[]
  folders: FolderSummary[]
  chats: ChatSummary[]
  files: WorkspaceFileSummary[]
}

interface ResourceState<T> {
  data: T
  loading: boolean
  error: string | null
  refresh: () => void
}

const CACHE_PREFIX = 'sim-workspace-vite:v1:'

function readCache<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${key}`)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeCache<T>(key: string, value: T): void {
  try {
    localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(value))
  } catch {}
}

export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: {
      accept: 'application/json',
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? String(payload.error)
        : `${response.status} ${response.statusText}`
    throw new Error(message)
  }
  return payload as T
}

export function useCachedResource<T>(
  key: string,
  path: string,
  fallback: T,
  select: (payload: unknown) => T
): ResourceState<T> {
  const [data, setData] = useState<T>(() => readCache(key, fallback))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    void requestJson<unknown>(path, { signal: controller.signal })
      .then((payload) => {
        const selected = select(payload)
        setData(selected)
        writeCache(key, selected)
      })
      .catch((cause) => {
        if (controller.signal.aborted) return
        setError(cause instanceof Error ? cause.message : 'Request failed')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [key, path, revision, select])

  const refresh = useCallback(() => setRevision((value) => value + 1), [])
  return { data, loading, error, refresh }
}

function messageText(value: unknown): string {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return ''
  const record = value as Record<string, unknown>
  if (typeof record.content === 'string') return record.content
  if (typeof record.text === 'string') return record.text
  if (Array.isArray(record.content)) {
    return record.content.map(messageText).filter(Boolean).join('\n')
  }
  return ''
}

export function normalizeMessages(payload: unknown): ChatMessage[] {
  if (!payload || typeof payload !== 'object') return []
  const root = payload as Record<string, unknown>
  const chat =
    root.chat && typeof root.chat === 'object' ? (root.chat as Record<string, unknown>) : {}
  const messages = Array.isArray(chat.messages) ? chat.messages : []

  return messages.flatMap((message, index) => {
    if (!message || typeof message !== 'object') return []
    const record = message as Record<string, unknown>
    const role = record.role === 'assistant' ? 'assistant' : record.role === 'user' ? 'user' : null
    const content = messageText(record)
    if (!role || !content) return []
    return [
      {
        id: typeof record.id === 'string' ? record.id : `${role}-${index}`,
        role,
        content,
      },
    ]
  })
}

function eventText(value: unknown): string {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return ''
  const record = value as Record<string, unknown>
  for (const key of ['delta', 'textDelta', 'text', 'content']) {
    if (typeof record[key] === 'string') return record[key] as string
  }
  return ''
}

export async function consumeChatResponse(
  response: Response,
  onText: (text: string) => void
): Promise<void> {
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(
      payload && typeof payload === 'object' && 'error' in payload
        ? String(payload.error)
        : `${response.status} ${response.statusText}`
    )
  }

  if (!response.body) return
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (!data || data === '[DONE]') continue
      try {
        const text = eventText(JSON.parse(data))
        if (text) onText(text)
      } catch {}
    }
  }
}

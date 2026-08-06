import type { ChatAttachment } from './api'

interface PresignedFileInfo {
  key: string
  path: string
}

interface PresignedUploadResponse {
  directUploadSupported: boolean
  fileInfo: PresignedFileInfo
  presignedUrl: string
  uploadHeaders?: Record<string, string>
}

interface UploadBatchResult {
  attachments: ChatAttachment[]
  errors: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

async function responseError(response: Response): Promise<string> {
  const payload: unknown = await response.json().catch(() => null)
  if (isRecord(payload)) {
    if (typeof payload.error === 'string') return payload.error
    if (typeof payload.message === 'string') return payload.message
  }
  return `${response.status} ${response.statusText}`
}

function normalizeUploadResponse(value: unknown): PresignedUploadResponse {
  if (!isRecord(value) || !isRecord(value.fileInfo)) {
    throw new Error('Invalid upload response')
  }
  const fileInfo = value.fileInfo
  return {
    directUploadSupported: value.directUploadSupported !== false,
    presignedUrl: typeof value.presignedUrl === 'string' ? value.presignedUrl : '',
    uploadHeaders: isRecord(value.uploadHeaders)
      ? Object.fromEntries(
          Object.entries(value.uploadHeaders).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string'
          )
        )
      : undefined,
    fileInfo: {
      key: typeof fileInfo.key === 'string' ? fileInfo.key : '',
      path: typeof fileInfo.path === 'string' ? fileInfo.path : '',
    },
  }
}

async function fallbackUpload(file: File, workspaceId: string): Promise<PresignedFileInfo> {
  const body = new FormData()
  body.append('file', file)
  body.append('context', 'mothership')
  body.append('workspaceId', workspaceId)
  const response = await fetch('/api/files/upload', {
    method: 'POST',
    credentials: 'include',
    body,
  })
  if (!response.ok) throw new Error(await responseError(response))
  const payload: unknown = await response.json()
  const root =
    isRecord(payload) && Array.isArray(payload.files) && payload.files.length === 1
      ? payload.files[0]
      : payload
  const normalized = normalizeUploadResponse(root)
  if (!normalized.fileInfo.key || !normalized.fileInfo.path) {
    throw new Error('Upload response is missing file metadata')
  }
  return normalized.fileInfo
}

async function uploadFile(
  file: File,
  workspaceId: string,
  attachmentId: string
): Promise<ChatAttachment> {
  const contentType = file.type || 'application/octet-stream'
  const response = await fetch(
    `/api/files/presigned?type=mothership&workspaceId=${encodeURIComponent(workspaceId)}`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name,
        contentType,
        fileSize: file.size,
      }),
    }
  )
  if (!response.ok) throw new Error(await responseError(response))
  const presigned = normalizeUploadResponse(await response.json())
  const fileInfo = presigned.directUploadSupported
    ? await (async () => {
        if (!presigned.presignedUrl || !presigned.fileInfo.key || !presigned.fileInfo.path) {
          throw new Error('Presigned upload response is incomplete')
        }
        const uploadResponse = await fetch(presigned.presignedUrl, {
          method: 'PUT',
          headers: {
            'content-type': contentType,
            ...presigned.uploadHeaders,
          },
          body: file,
        })
        if (!uploadResponse.ok) {
          throw new Error(`Storage upload failed: ${uploadResponse.status}`)
        }
        return presigned.fileInfo
      })()
    : await fallbackUpload(file, workspaceId)

  return {
    id: attachmentId,
    key: fileInfo.key,
    filename: file.name,
    mediaType: contentType,
    size: file.size,
    path: fileInfo.path,
  }
}

export async function uploadAttachments(
  files: File[],
  workspaceId: string
): Promise<UploadBatchResult> {
  const batchId = Date.now()
  const settled = await Promise.allSettled(
    files.map((file, index) => uploadFile(file, workspaceId, `vite-${batchId}-${index}`))
  )
  const attachments: ChatAttachment[] = []
  const errors: string[] = []

  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      attachments.push(result.value)
      return
    }
    const reason = result.reason instanceof Error ? result.reason.message : 'Upload failed'
    errors.push(`${files[index]?.name ?? 'File'}: ${reason}`)
  })

  return { attachments, errors }
}

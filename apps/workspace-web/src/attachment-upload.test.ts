/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { uploadAttachments } from './attachment-upload'

describe('workspace Vite attachment upload', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses the server fallback when direct storage is unavailable', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('/api/files/presigned')) {
        return Response.json({
          directUploadSupported: false,
          presignedUrl: '',
          fileInfo: { key: '', path: '' },
        })
      }
      if (url === '/api/files/upload') {
        return Response.json({
          fileInfo: {
            key: 'workspace-1/report.txt',
            path: '/api/files/serve/report.txt?context=mothership',
          },
          directUploadSupported: false,
          presignedUrl: '',
        })
      }
      return new Response(null, { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await uploadAttachments(
      [new File(['hello'], 'report.txt', { type: 'text/plain' })],
      'workspace-1'
    )

    expect(result.errors).toEqual([])
    expect(result.attachments).toEqual([
      expect.objectContaining({
        filename: 'report.txt',
        key: 'workspace-1/report.txt',
        mediaType: 'text/plain',
        size: 5,
      }),
    ])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('keeps successful files when another upload fails', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.startsWith('/api/files/presigned')) {
        const body = JSON.parse(String(init?.body)) as { fileName: string }
        if (body.fileName === 'bad.exe') {
          return Response.json({ error: 'File type is not allowed' }, { status: 400 })
        }
        return Response.json({
          directUploadSupported: true,
          presignedUrl: 'https://storage.test/good.txt',
          fileInfo: {
            key: 'workspace-1/good.txt',
            path: '/api/files/serve/good.txt?context=mothership',
          },
        })
      }
      if (url === 'https://storage.test/good.txt') return new Response(null, { status: 200 })
      return new Response(null, { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await uploadAttachments(
      [new File(['ok'], 'good.txt'), new File(['bad'], 'bad.exe')],
      'workspace-1'
    )

    expect(result.attachments).toHaveLength(1)
    expect(result.attachments[0]?.filename).toBe('good.txt')
    expect(result.errors).toEqual(['bad.exe: File type is not allowed'])
  })
})

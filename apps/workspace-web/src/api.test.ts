/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { normalizeMessages } from './api'

describe('workspace Vite chat history', () => {
  it('keeps assistant messages that contain tool calls without text', () => {
    const messages = normalizeMessages({
      chat: {
        messages: [
          {
            id: 'assistant-1',
            role: 'assistant',
            content: '',
            contentBlocks: [
              {
                type: 'tool',
                toolCall: {
                  id: 'tool-1',
                  name: 'create_workflow',
                  state: 'success',
                  display: { title: 'Created workflow' },
                },
              },
            ],
          },
        ],
      },
    })

    expect(messages).toEqual([
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            id: 'tool-1',
            name: 'create_workflow',
            status: 'success',
            title: 'Created workflow',
          },
        ],
      },
    ])
  })

  it('normalizes persisted user attachments', () => {
    const messages = normalizeMessages({
      chat: {
        messages: [
          {
            id: 'user-1',
            role: 'user',
            content: 'Review this',
            fileAttachments: [
              {
                id: 'attachment-1',
                key: 'workspace/report.pdf',
                filename: 'report.pdf',
                media_type: 'application/pdf',
                size: 2048,
                path: '/api/files/serve/report.pdf?context=mothership',
              },
            ],
          },
        ],
      },
    })

    expect(messages[0]?.attachments).toEqual([
      {
        id: 'attachment-1',
        key: 'workspace/report.pdf',
        filename: 'report.pdf',
        mediaType: 'application/pdf',
        size: 2048,
        path: '/api/files/serve/report.pdf?context=mothership',
      },
    ])
  })
})

import { describe, expect, it } from 'vitest'
import { toolCatalogItemV1Schema } from '../src'
import { createCatalogSummaryReader } from '../src/browser'

describe('browser-safe tool catalog contract', () => {
  it('retains serializable metadata and strips unknown runtime fields', () => {
    const item = toolCatalogItemV1Schema.parse({
      catalogVersion: 1,
      id: 'slack.send_message',
      legacyIds: ['slack_send_message'],
      provider: 'slack',
      version: '1',
      display: {
        name: 'Send message',
        description: 'Send a channel message',
        category: 'communication',
      },
      capabilities: ['network'],
      inputs: [
        {
          key: 'channel',
          label: 'Channel',
          type: 'string',
          required: true,
        },
      ],
      execute: 'must-not-cross-the-wire',
    })

    expect(item).not.toHaveProperty('execute')
    expect(() => JSON.stringify(item)).not.toThrow()
  })

  it('resolves legacy IDs and paginates provider searches without runtime schemas', () => {
    const reader = createCatalogSummaryReader({
      catalogVersion: 1,
      catalogHash: 'sha256:test',
      items: [
        {
          id: 'slack_v2',
          legacyIds: ['slack-v2'],
          provider: 'slack',
          version: '2',
          display: {
            name: 'Slack',
            description: 'Send messages',
            category: 'tools',
            bgColor: '#611f69',
          },
          visibility: { hideFromToolbar: false, preview: false },
        },
        {
          id: 'gmail',
          legacyIds: [],
          provider: 'gmail',
          version: '1',
          display: {
            name: 'Gmail',
            description: 'Send email',
            category: 'tools',
          },
          visibility: { hideFromToolbar: false, preview: false },
        },
      ],
    })

    expect(reader.get('slack-v2')?.id).toBe('slack_v2')
    expect(reader.all()).toHaveLength(2)
    expect(reader.search({ provider: 'slack', query: 'message', limit: 1 })).toMatchObject({
      items: [{ id: 'slack_v2' }],
      nextCursor: null,
    })
  })
})

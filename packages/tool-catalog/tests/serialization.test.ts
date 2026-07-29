import { describe, expect, it } from 'vitest'
import { toolCatalogItemV1Schema } from '../src'

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
})

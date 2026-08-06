import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  agentToolOptionsDocumentV1Schema,
  type EditorBlockTemplateV1,
  editorBlockTemplateDocumentV1Schema,
  toolCatalogItemV1Schema,
} from '../src'
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
          visibility: { hideFromToolbar: false, preview: false, editorCreatable: true },
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
          visibility: { hideFromToolbar: false, preview: false, editorCreatable: false },
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

  it('ships only serializable, registry-free editor creation templates', () => {
    const directory = path.join(import.meta.dirname, '..', 'generated', 'editor-block-templates')
    const templates = readdirSync(directory)
      .sort()
      .flatMap((file): EditorBlockTemplateV1[] => {
        const document = editorBlockTemplateDocumentV1Schema.parse(
          JSON.parse(readFileSync(path.join(directory, file), 'utf8'))
        )
        return document.templates
      })
    expect(templates).toHaveLength(313)
    expect(templates.find((template) => template.type === 'api')).toMatchObject({
      name: 'API',
      fields: expect.arrayContaining([
        expect.objectContaining({ id: 'url', type: 'short-input', initialValue: null }),
        expect.objectContaining({
          id: 'method',
          options: expect.arrayContaining([{ id: 'GET', label: 'GET' }]),
        }),
      ]),
      outputs: expect.objectContaining({ data: { type: 'json' } }),
    })
    for (const type of ['fireflies_v2', 'stt_v2']) {
      const template = templates.find((candidate) => candidate.type === type)
      expect(template, `${type} template`).toBeDefined()
      expect(template?.fields.some((field) => field.id === 'audioUrl')).toBe(false)
    }
    expect(templates.find((template) => template.type === 'start_trigger')).toMatchObject({
      kind: 'trigger',
      outputs: expect.objectContaining({ input: { type: 'string' } }),
    })
    expect(templates.find((template) => template.type === 'mcp')).toMatchObject({
      fields: expect.arrayContaining([
        expect.objectContaining({ id: 'tool', dependsOn: ['server'] }),
      ]),
    })
    for (const template of templates) {
      expect(new Set(template.fields.map((field) => field.id)).size).toBe(template.fields.length)
    }
    expect(JSON.stringify(templates)).not.toMatch(/"(?:execute|providerSdk|runtimeRegistry)"\s*:/i)
  })

  it('ships agent tool capabilities as a separate lazy browser artifact', () => {
    const document = agentToolOptionsDocumentV1Schema.parse(
      JSON.parse(
        readFileSync(
          path.join(import.meta.dirname, '..', 'generated', 'agent-tool-options.json'),
          'utf8'
        )
      )
    )
    expect(document.items.length).toBeGreaterThan(250)
    expect(document.items.find((item) => item.type === 'airtable')).toMatchObject({
      title: 'Airtable',
      capabilities: expect.arrayContaining(['airtable_list_records']),
    })
  })
})

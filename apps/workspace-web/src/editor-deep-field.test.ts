import { describe, expect, it } from 'vitest'
import { extractWorkflowInputFields } from './editor-deep-field'

describe('extractWorkflowInputFields', () => {
  it('reads the current trigger input format without importing the runtime registry', () => {
    expect(
      extractWorkflowInputFields({
        data: {
          state: {
            blocks: {
              start: {
                type: 'starter',
                subBlocks: {
                  inputFormat: {
                    value: [
                      { name: 'query', type: 'string' },
                      { name: 'limit', type: 'number' },
                      { name: '', type: 'boolean' },
                    ],
                  },
                },
              },
            },
          },
        },
      })
    ).toEqual([
      { name: 'query', type: 'string' },
      { name: 'limit', type: 'number' },
    ])
  })

  it('supports the legacy config location', () => {
    expect(
      extractWorkflowInputFields({
        data: {
          state: {
            blocks: {
              start: {
                type: 'input_trigger',
                config: { params: { inputFormat: [{ name: 'payload' }] } },
              },
            },
          },
        },
      })
    ).toEqual([{ name: 'payload', type: 'string' }])
  })
})

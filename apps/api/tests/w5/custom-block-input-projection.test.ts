import { describe, expect, it } from 'vitest'
import {
  CUSTOM_BLOCK_INPUT_TRIGGER_TYPES,
  projectCustomBlockInputs,
} from '@/modules/custom-blocks/application/project-custom-block-inputs'

describe('custom-block deployment input projection', () => {
  it.each([...CUSTOM_BLOCK_INPUT_TRIGGER_TYPES])(
    'projects current %s snapshot input fields without the registry',
    (type) => {
      expect(
        projectCustomBlockInputs({
          blocks: {
            trigger: {
              type,
              subBlocks: {
                inputFormat: {
                  value: [{ id: `${type}-id`, name: `${type} field`, type: 'string' }],
                },
              },
            },
          },
        })
      ).toEqual([{ id: `${type}-id`, name: `${type} field`, type: 'string' }])
    }
  )

  it.each([...CUSTOM_BLOCK_INPUT_TRIGGER_TYPES])(
    'projects legacy %s snapshot input fields without the serializer',
    (type) => {
      expect(
        projectCustomBlockInputs({
          blocks: {
            trigger: {
              type,
              config: {
                params: {
                  inputFormat: [{ id: `${type}-id`, name: `${type} field` }],
                },
              },
            },
          },
        })
      ).toEqual([{ id: `${type}-id`, name: `${type} field`, type: 'string' }])
    }
  )

  it('drops malformed fields and ignores non-input block types', () => {
    expect(
      projectCustomBlockInputs({
        blocks: {
          trigger: {
            type: 'webhook',
            subBlocks: { inputFormat: { value: [{ id: 'secret', name: 'Must not leak' }] } },
          },
        },
      })
    ).toEqual([])
    expect(
      projectCustomBlockInputs({
        blocks: {
          trigger: {
            type: 'starter',
            subBlocks: { inputFormat: { value: [null, {}, { name: '' }] } },
          },
        },
      })
    ).toEqual([])
  })
})

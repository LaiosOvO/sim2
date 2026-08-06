/**
 * @vitest-environment node
 */
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadSelectorDefinition } from '@/hooks/selectors/lazy-registry'

const templateDirectory = path.resolve(
  import.meta.dirname,
  '../../../../packages/tool-catalog/generated/editor-block-templates'
)

describe('lazy selector registry', () => {
  it('covers every generated selector delegated by the Vite provider gateway', async () => {
    const keys = new Set<string>()
    for (const filename of await readdir(templateDirectory)) {
      const document = JSON.parse(
        await readFile(path.join(templateDirectory, filename), 'utf8')
      ) as {
        templates?: Array<{ fields?: Array<{ selectorKey?: string }> }>
      }
      for (const template of document.templates ?? []) {
        for (const field of template.fields ?? []) {
          if (field.selectorKey) keys.add(field.selectorKey)
        }
      }
    }

    keys.delete('sim.workflows')
    keys.delete('table.columns')
    expect(keys.size).toBe(55)

    for (const key of keys) {
      const definition = await loadSelectorDefinition(key)
      expect(definition?.key, key).toBe(key)
    }
  })
})

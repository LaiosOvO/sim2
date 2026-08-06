/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { loadEditorBlockTemplate } from './editor-templates'

describe('workspace Vite editor template shards', () => {
  it('loads only the deterministic shard for a safe template', async () => {
    await expect(loadEditorBlockTemplate('api')).resolves.toMatchObject({
      type: 'api',
      name: 'API',
      fields: expect.arrayContaining([expect.objectContaining({ id: 'url' })]),
    })
  })

  it('loads inherited provider fields without importing the runtime registry', async () => {
    await expect(loadEditorBlockTemplate('agent')).resolves.toMatchObject({
      type: 'agent',
      fields: expect.arrayContaining([expect.objectContaining({ id: 'vertexCredential' })]),
    })
  })

  it('defers environment-dependent defaults to the Vite runtime without importing server code', async () => {
    await expect(loadEditorBlockTemplate('pi')).resolves.toMatchObject({
      type: 'pi',
      fields: expect.arrayContaining([
        expect.objectContaining({ id: 'mode', initialValue: '__E2B_MODE__' }),
      ]),
    })
  })

  it('loads trigger creation fields from the browser-safe contract', async () => {
    await expect(loadEditorBlockTemplate('generic_webhook')).resolves.toMatchObject({
      kind: 'trigger',
      fields: expect.arrayContaining([
        expect.objectContaining({ id: 'token', initialValue: '__GENERATE_ID__' }),
        expect.objectContaining({ id: 'inputFormat' }),
      ]),
    })
  })
})

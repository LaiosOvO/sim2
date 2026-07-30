import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const files = {
  modal: new URL('../components/fork-workspace-modal/fork-workspace-modal.tsx', import.meta.url),
  resourceHook: new URL('./use-fork-resources.ts', import.meta.url),
  createHook: new URL('./use-fork-workspace.ts', import.meta.url),
  resourceContract: new URL(
    '../../../lib/api/contracts/workspace-fork-resources.ts',
    import.meta.url
  ),
  createContract: new URL('../../../lib/api/contracts/workspace-fork-create.ts', import.meta.url),
}

describe('fork resource picker browser boundary', () => {
  it('does not import the monolithic workspace-fork contract or hook', () => {
    for (const [label, url] of Object.entries(files)) {
      const source = readFileSync(url, 'utf8')
      expect(source, label).not.toContain("from '@/lib/api/contracts/workspace-fork'")
      expect(source, label).not.toContain("from '@/ee/workspace-forking/hooks/workspace-fork'")
    }
  })

  it('keeps the two focused contract entries within a small source budget', () => {
    const sourceBytes =
      statSync(fileURLToPath(files.resourceContract)).size +
      statSync(fileURLToPath(files.createContract)).size
    expect(sourceBytes).toBeLessThanOrEqual(5_000)
  })
})

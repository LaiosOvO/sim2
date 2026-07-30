import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const files = {
  modal: new URL('../components/fork-workspace-modal/fork-workspace-modal.tsx', import.meta.url),
  resourcePicker: new URL(
    '../components/fork-resource-picker/fork-resource-picker.tsx',
    import.meta.url
  ),
  fileTree: new URL('../components/fork-file-tree/fork-file-tree.tsx', import.meta.url),
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

  it('uses the focused EMCN surface instead of UI and icon root barrels', () => {
    for (const label of ['modal', 'resourcePicker', 'fileTree'] as const) {
      const source = readFileSync(files[label], 'utf8')
      expect(source, label).toContain("from '@sim/emcn/workspace-fork'")
      expect(source, label).not.toContain("from '@sim/emcn'")
      expect(source, label).not.toContain("from 'lucide-react'")
    }
  })

  it('keeps the two focused contract entries within a small source budget', () => {
    const sourceBytes =
      statSync(fileURLToPath(files.resourceContract)).size +
      statSync(fileURLToPath(files.createContract)).size
    expect(sourceBytes).toBeLessThanOrEqual(5_000)
  })
})

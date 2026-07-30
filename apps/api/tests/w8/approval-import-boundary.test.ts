import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..', '..', '..')
const source = (file: string) => path.join(repositoryRoot, file)

const browserFiles = [
  'apps/sim/lib/api/contracts/approvals.ts',
  'apps/sim/hooks/queries/approvals.ts',
  'apps/sim/app/workspace/[workspaceId]/approvals/page.tsx',
]
const facadeFiles = [
  'apps/sim/app/api/approvals/route.ts',
  'apps/sim/app/api/approvals/start/route.ts',
  'apps/sim/app/api/approvals/audit-logs/route.ts',
  'apps/sim/app/api/approvals/definitions/route.ts',
  'apps/sim/app/api/approvals/definitions/[definitionId]/versions/route.ts',
  'apps/sim/app/api/approvals/definitions/[definitionId]/versions/[versionId]/publish/route.ts',
  'apps/sim/app/api/approvals/[approvalId]/decisions/route.ts',
  'apps/sim/app/api/approvals/[approvalId]/resume/route.ts',
]

describe('W8 approval import boundary', () => {
  it('keeps browser consumers free of DB, Executor, tools, blocks and API modules', async () => {
    for (const file of browserFiles) {
      const content = await readFile(source(file), 'utf8')
      for (const forbidden of [
        '@sim/db',
        '@/executor',
        '@/tools',
        '@/blocks',
        '@/lib/approvals',
        '@/modules/approvals',
      ]) {
        expect(content, `${file} imports ${forbidden}`).not.toContain(forbidden)
      }
    }
  })

  it('keeps all eight Next routes as one-import facades', async () => {
    for (const file of facadeFiles) {
      const content = await readFile(source(file), 'utf8')
      const imports = content.match(/^import .*$/gm) ?? []
      expect(imports, file).toHaveLength(1)
      expect(imports[0]).toContain('@/lib/api-proxy/w8-approvals')
      expect(content).not.toContain('zod')
      expect(content).not.toContain('@sim/db')
    }
  })

  it('keeps external channels behind ports', async () => {
    const content = await readFile(
      source('apps/api/src/modules/approvals/application/create-approvals-module.ts'),
      'utf8'
    )
    expect(content).not.toMatch(/from ['"].*(feishu|meegle)/i)
    expect(content).toContain('ApprovalEffectsPort')
    expect(content).toContain('ApprovalResumeCommand')
  })
})

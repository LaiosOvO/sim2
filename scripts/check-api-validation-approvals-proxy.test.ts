import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('API validation W8 approval proxy recognition', () => {
  it('recognizes the versioned proxy and ratchets all eight routes as Zod-backed', async () => {
    const source = await readFile('scripts/check-api-validation-contracts.ts', 'utf8')
    expect(source).toContain('|w8-approvals')
    expect(source).toContain('|W8ApprovalRequest')
    expect(source).toMatch(/totalRoutes:\s*1000/)
    expect(source).toMatch(/zodRoutes:\s*1000/)
    expect(source).toMatch(/nonZodRoutes:\s*0/)
  })
})

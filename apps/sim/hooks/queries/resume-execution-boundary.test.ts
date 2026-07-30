import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const files = [
  new URL('./resume-execution.ts', import.meta.url),
  new URL('../../app/(interfaces)/resume/[workflowId]/[executionId]/page.tsx', import.meta.url),
  new URL('../../app/api/resume/[workflowId]/[executionId]/route.ts', import.meta.url),
  new URL('../../app/api/workflows/[id]/paused/[executionId]/route.ts', import.meta.url),
  new URL('../../app/api/workflows/[id]/paused/route.ts', import.meta.url),
]

describe('resume read compile boundary', () => {
  it('keeps the page, hook, and three native facades outside executor and workflow barrels', () => {
    for (const file of files) {
      const source = readFileSync(fileURLToPath(file), 'utf8')
      expect(source, file.pathname).not.toContain('human-in-the-loop-manager')
      expect(source, file.pathname).not.toContain('@/executor/')
      expect(source, file.pathname).not.toContain('@/lib/api/contracts/workflows')
      expect(source, file.pathname).not.toContain('@/app/api/workflows/middleware')
    }
  })
})

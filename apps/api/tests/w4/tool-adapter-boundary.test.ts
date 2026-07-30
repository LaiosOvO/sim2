import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

function collectTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    return statSync(path).isDirectory()
      ? collectTypeScriptFiles(path)
      : path.endsWith('.ts')
        ? [path]
        : []
  })
}

describe('tool adapter import boundary', () => {
  it('does not import UI routes, provider registries, executor, or sandbox code', () => {
    const moduleRoot = fileURLToPath(new URL('../../src/modules/tool-adapters', import.meta.url))
    const forbiddenImports =
      /from\s+['"][^'"]*(?:next|apps\/sim|\/registry|\/executor|\/sandbox)[^'"]*['"]/

    for (const path of collectTypeScriptFiles(moduleRoot)) {
      expect(readFileSync(path, 'utf8'), path).not.toMatch(forbiddenImports)
    }
  })
})

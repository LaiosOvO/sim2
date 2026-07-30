import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const moduleRoot = fileURLToPath(new URL('../../src/modules/execution/read', import.meta.url))
const postgresReaderPath = fileURLToPath(
  new URL(
    '../../src/infrastructure/postgres/repositories/drizzle-paused-execution-reader.ts',
    import.meta.url
  )
)
const workflowAuthorizerPath = fileURLToPath(
  new URL(
    '../../src/infrastructure/postgres/repositories/platform-workflow-read-authorizer.ts',
    import.meta.url
  )
)
const contractPath = fileURLToPath(
  new URL('../../../../packages/api-contracts/src/execution-read.ts', import.meta.url)
)

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.isFile() && entry.name.endsWith('.ts') ? [path] : []
  })
}

describe('execution read import boundary', () => {
  it('keeps Executor, Registry, Sandbox and persistence out of the deep module', () => {
    const forbidden = [
      '@/executor',
      '/executor/',
      'PauseResumeManager',
      'human-in-the-loop-manager',
      '@/blocks/registry',
      '@/tools/registry',
      '@/sandbox',
      '@sim/db',
      'drizzle-orm',
    ]
    const violations = sourceFiles(moduleRoot).flatMap((path) => {
      const source = readFileSync(path, 'utf8')
      return forbidden
        .filter((token) => source.includes(token))
        .map((token) => `${path.slice(dirname(moduleRoot).length)} -> ${token}`)
    })
    expect(violations).toEqual([])
  })

  it('keeps heavy runtime roots out of the API adapters and browser-safe contract', () => {
    const forbidden = [
      '@/executor',
      '/executor/',
      'PauseResumeManager',
      'human-in-the-loop-manager',
      '@/blocks/registry',
      '@/tools/registry',
      '@/sandbox',
    ]
    const violations = [postgresReaderPath, workflowAuthorizerPath, contractPath].flatMap(
      (path) => {
        const source = readFileSync(path, 'utf8')
        return forbidden
          .filter((token) => source.includes(token))
          .map((token) => `${path} -> ${token}`)
      }
    )
    expect(violations).toEqual([])
  })

  it('ratchets the list query to a trigger-id JSON projection instead of a full snapshot', () => {
    const source = readFileSync(postgresReaderPath, 'utf8')
    const listSource = source.slice(source.indexOf('async list('))
    expect(listSource).toContain('triggerIds: sql<unknown>')
    expect(listSource).not.toContain('executionSnapshot: pausedExecutions.executionSnapshot')
  })
})

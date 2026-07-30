import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('lightweight client surface CLI', () => {
  it('returns non-zero for a controlled impossible budget', async () => {
    const child = spawn(
      'bun',
      [
        'run',
        'scripts/architecture/build-isolation/check-lightweight-client-surfaces.ts',
        '--baseline',
        'scripts/architecture/build-isolation/fixtures/lightweight-client-impossible-budget.json',
      ],
      {
        cwd: fileURLToPath(new URL('../../..', import.meta.url)),
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    )
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      output += String(chunk)
    })
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', resolve)
    })

    expect(exitCode).toBe(1)
    expect(output).toContain('gzip bytes exceeds 1')
  })
})

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const root = new URL('../../', import.meta.url)

function source(path: string): string {
  return readFileSync(new URL(path, root), 'utf8')
}

describe('execution-control import and query ratchets', () => {
  it('keeps all three Next facades free of registries, executor, sandbox, DB and crypto', () => {
    for (const path of [
      '../sim/app/api/jobs/[jobId]/route.ts',
      '../sim/app/api/resume/poll/route.ts',
      '../sim/app/api/workflows/[id]/executions/[executionId]/route.ts',
    ]) {
      const text = source(path)
      for (const forbidden of [
        '@sim/db',
        'registry',
        '/executor/',
        'sandbox',
        'encryption',
        'PauseResumeManager',
      ]) {
        expect(text.toLowerCase()).not.toContain(forbidden.toLowerCase())
      }
      expect(text).toContain('w6-execution-control')
    }
  })

  it('binds paused and execution reads to both workflow and execution IDs', () => {
    const text = source(
      'src/modules/execution/control/infrastructure/drizzle-execution-status-reader.ts'
    )
    expect(text).toContain('eq(pausedExecutions.workflowId, workflowId)')
    expect(text).toContain('eq(pausedExecutions.executionId, executionId)')
    expect(text).toContain('eq(workflowExecutionLogs.workflowId, workflowId)')
    expect(text).toContain('eq(workflowExecutionLogs.executionId, executionId)')
    expect(text).toContain('.leftJoin(')
  })

  it('keeps Worker-only code out of the API module closure', () => {
    const text = source('src/modules/execution/control/create-execution-control-module.ts')
    expect(text).not.toContain('@sim/db')
    expect(text).not.toContain('drizzle-orm')
    expect(text).not.toContain('@/executor')
    expect(text).not.toContain('@/sandbox')
    expect(text).not.toContain('PauseResumeManager')
  })

  it('fails closed rather than composing the pointer-dropping inline adapter', () => {
    const text = source('src/bootstrap/composition/create-production-api-options.ts')
    expect(text).not.toContain('createInlineExecutionPayloadMaterializer')
    expect(text).toContain('createUnavailableExecutionObjectStore')
    expect(text).toContain('EXECUTION_OBJECT_STORE_URL')
  })

  it('leases due rows and submits resume jobs from Worker rather than Next or API', () => {
    const text = source('../worker/src/jobs/resume/create-drizzle-resume-poller.ts')
    expect(text).toContain("inArray(pausedExecutions.status, ['paused', 'partially_resumed'])")
    expect(text).toContain('lte(pausedExecutions.nextResumeAt, now)')
    expect(text).toContain('automaticResumeRetryCount')
    expect(text).toContain('tx.insert(resumeQueue)')
    expect(text).toContain("point.resumeStatus = 'resuming'")
    expect(text).toContain("status: 'completed'")
    expect(text).toContain('newExecutionId: row.executionId')
    expect(text).toContain('finishResume')
  })
})

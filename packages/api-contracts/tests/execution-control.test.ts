import {
  jobStatusResponseV1Schema,
  resumePollResponseV1Schema,
  workflowExecutionStatusQueryV1Schema,
  workflowExecutionStatusResponseV1Schema,
} from '@sim/api-contracts/execution-control'
import { describe, expect, it } from 'vitest'

describe('execution-control contracts', () => {
  it('keeps job status metadata opaque and bounded by a small outer contract', () => {
    expect(
      jobStatusResponseV1Schema.parse({
        success: true,
        taskId: 'job-1',
        status: 'completed',
        metadata: { workflowId: 'workflow-1' },
        output: { answer: 42 },
      }).status
    ).toBe('completed')
  })

  it('normalizes selected output selectors without importing execution types', () => {
    expect(
      workflowExecutionStatusQueryV1Schema.parse({
        includeOutput: 'true',
        selectedOutputs: 'agent.text, transform.value',
      })
    ).toEqual({
      includeOutput: true,
      selectedOutputs: ['agent.text', 'transform.value'],
    })
  })

  it('validates the pure status and resume-poll responses', () => {
    expect(
      workflowExecutionStatusResponseV1Schema.parse({
        executionId: 'execution-1',
        workflowId: 'workflow-1',
        status: 'running',
        trigger: 'api',
        level: 'info',
        startedAt: '2026-07-30T00:00:00.000Z',
        endedAt: null,
        totalDurationMs: null,
        paused: null,
        cost: null,
        error: null,
        finalOutput: null,
        blockOutputs: null,
      }).status
    ).toBe('running')
    expect(
      resumePollResponseV1Schema.parse({
        success: true,
        requestId: 'request-1',
        claimedRows: 2,
        dispatched: 2,
        failures: [],
      }).dispatched
    ).toBe(2)
  })
})

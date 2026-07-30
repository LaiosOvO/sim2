import { describe, expect, it } from 'vitest'
import {
  executionReadRoutesV1,
  executionReadRouteV1Schema,
  pausedExecutionDetailV1Schema,
  pausedExecutionListResponseV1Schema,
  resumeExecutionParamsV1Schema,
} from '../src/execution-read'

const summary = {
  id: 'paused-1',
  workflowId: 'workflow-1',
  executionId: 'execution-1',
  status: 'paused',
  totalPauseCount: 1,
  resumedCount: 0,
  pausedAt: '2026-07-30T00:00:00.000Z',
  updatedAt: '2026-07-30T00:01:00.000Z',
  expiresAt: null,
  metadata: {},
  triggerIds: ['trigger-1'],
  pausePoints: [
    {
      contextId: 'context-1',
      blockId: 'context-1',
      resumeStatus: 'paused',
      snapshotReady: false,
      pauseKind: 'human',
      queuePosition: null,
      latestResumeEntry: null,
    },
  ],
}

describe('execution read contracts', () => {
  it('freezes the three W6 native route aliases and hybrid auth policy', () => {
    expect(executionReadRoutesV1.map((route) => executionReadRouteV1Schema.parse(route))).toEqual(
      executionReadRoutesV1
    )
  })

  it('parses paused detail and list wire shapes', () => {
    expect(
      pausedExecutionDetailV1Schema.parse({
        ...summary,
        executionSnapshot: {
          snapshot: '{"metadata":{"workflowId":"workflow-1"}}',
          triggerIds: ['trigger-1'],
        },
        queue: [
          {
            id: 'queue-1',
            pausedExecutionId: 'paused-1',
            parentExecutionId: 'execution-1',
            newExecutionId: 'execution-2',
            contextId: 'context-1',
            resumeInput: null,
            status: 'pending',
            queuedAt: '2026-07-30T00:02:00.000Z',
            claimedAt: null,
            completedAt: null,
            failureReason: null,
          },
        ],
      }).queue
    ).toHaveLength(1)
    expect(
      pausedExecutionListResponseV1Schema.parse({ pausedExecutions: [summary] }).pausedExecutions
    ).toHaveLength(1)
  })

  it('rejects empty route identifiers and invalid timestamps', () => {
    expect(
      resumeExecutionParamsV1Schema.safeParse({ workflowId: '', executionId: '' }).success
    ).toBe(false)
    expect(
      pausedExecutionListResponseV1Schema.safeParse({
        pausedExecutions: [{ ...summary, pausedAt: 'not-an-iso-date' }],
      }).success
    ).toBe(false)
  })

  it('rejects undeclared persistence fields at the public wire boundary', () => {
    expect(
      pausedExecutionDetailV1Schema.safeParse({
        ...summary,
        internalLeaseToken: 'must-not-leak',
        executionSnapshot: {
          snapshot: '{"metadata":{"workflowId":"workflow-1"}}',
          triggerIds: ['trigger-1'],
        },
        queue: [],
      }).success
    ).toBe(false)
    expect(
      pausedExecutionDetailV1Schema.safeParse({
        ...summary,
        executionSnapshot: {
          snapshot: '{"metadata":{"workflowId":"workflow-1"}}',
          triggerIds: ['trigger-1'],
          decryptedCredentials: 'must-not-leak',
        },
        queue: [],
      }).success
    ).toBe(false)
  })
})

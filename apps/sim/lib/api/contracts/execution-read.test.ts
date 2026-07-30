import { describe, expect, it } from 'vitest'
import {
  getPauseContextDetailContract,
  getPausedExecutionDetailContract,
} from '@/lib/api/contracts/execution-read'

describe('focused execution-read browser contracts', () => {
  it('freezes the native paused execution detail without persistence extras', () => {
    const parsed = getPausedExecutionDetailContract.response.schema.parse({
      id: 'paused-1',
      workflowId: 'workflow-1',
      executionId: 'execution-1',
      status: 'paused',
      totalPauseCount: 1,
      resumedCount: 0,
      pausedAt: null,
      updatedAt: null,
      expiresAt: null,
      metadata: null,
      triggerIds: [],
      pausePoints: [
        {
          contextId: 'context-1',
          blockId: 'block-1',
          resumeStatus: 'paused',
          snapshotReady: true,
          pauseKind: 'human',
          queuePosition: null,
          latestResumeEntry: null,
        },
      ],
      executionSnapshot: { snapshot: '{}', triggerIds: [] },
      queue: [],
    })
    expect(parsed.executionId).toBe('execution-1')
  })

  it('keeps the not-yet-native context payload opaque and isolated', () => {
    const parsed = getPauseContextDetailContract.response.schema.parse({
      execution: { id: 'paused-1' },
      pausePoint: { contextId: 'context-1', response: { data: { user: true } } },
      queue: [],
      compatibilityExtra: true,
    })
    expect(parsed.pausePoint.contextId).toBe('context-1')
  })
})

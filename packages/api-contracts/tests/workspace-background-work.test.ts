import {
  listWorkspaceBackgroundWorkContractV1,
  listWorkspaceBackgroundWorkResponseV1Schema,
  workspaceBackgroundWorkQueryV1Schema,
} from '@sim/api-contracts/workspace-background-work'
import { describe, expect, it } from 'vitest'

describe('workspace background work V1 contract', () => {
  it('freezes the donor method, path, pagination coercion, and cap', () => {
    expect(listWorkspaceBackgroundWorkContractV1.method).toBe('GET')
    expect(listWorkspaceBackgroundWorkContractV1.path).toBe('/api/workspaces/[id]/background-work')
    expect(workspaceBackgroundWorkQueryV1Schema.parse({})).toEqual({ limit: 50 })
    expect(workspaceBackgroundWorkQueryV1Schema.parse({ limit: '0' })).toEqual({ limit: 50 })
    expect(workspaceBackgroundWorkQueryV1Schema.parse({ limit: '-2' })).toEqual({ limit: 1 })
    expect(workspaceBackgroundWorkQueryV1Schema.parse({ limit: '5000' })).toEqual({ limit: 100 })
  })

  it('rejects repeated scalar cursor and limit representations', () => {
    expect(
      workspaceBackgroundWorkQueryV1Schema.safeParse({ cursor: ['cursor-1', 'cursor-2'] }).success
    ).toBe(false)
    expect(workspaceBackgroundWorkQueryV1Schema.safeParse({ limit: ['1', '100'] }).success).toBe(
      false
    )
  })

  it('accepts the complete wire shape and strips unknown metadata fields', () => {
    const value = listWorkspaceBackgroundWorkResponseV1Schema.parse({
      items: [
        {
          id: 'work-1',
          workspaceId: 'workspace-1',
          workflowId: null,
          kind: 'fork_sync',
          status: 'completed',
          message: 'Synced',
          error: null,
          metadata: {
            actorName: 'Ada',
            otherWorkspaceId: 'workspace-2',
            direction: 'push',
            updated: 2,
            secretToken: 'must-not-leak',
          },
          startedAt: '2026-07-30T00:00:00.000Z',
          completedAt: '2026-07-30T00:00:01.000Z',
        },
      ],
      nextCursor: null,
    })

    expect(value.items[0].metadata).toEqual({
      actorName: 'Ada',
      otherWorkspaceId: 'workspace-2',
      direction: 'push',
      updated: 2,
    })
    expect(JSON.stringify(value)).not.toContain('must-not-leak')
  })

  it('rejects invalid kinds, statuses, metadata types, and incomplete items', () => {
    const base = {
      id: 'work-1',
      workspaceId: 'workspace-1',
      workflowId: null,
      kind: 'fork_sync',
      status: 'completed',
      message: null,
      error: null,
      metadata: null,
      startedAt: 'now',
      completedAt: null,
    }

    expect(() =>
      listWorkspaceBackgroundWorkResponseV1Schema.parse({
        items: [{ ...base, kind: 'sandbox_execution' }],
        nextCursor: null,
      })
    ).toThrow()
    expect(() =>
      listWorkspaceBackgroundWorkResponseV1Schema.parse({
        items: [{ ...base, status: 'cancelled' }],
        nextCursor: null,
      })
    ).toThrow()
    expect(() =>
      listWorkspaceBackgroundWorkResponseV1Schema.parse({
        items: [{ ...base, metadata: { copied: '1' } }],
        nextCursor: null,
      })
    ).toThrow()
    expect(() =>
      listWorkspaceBackgroundWorkResponseV1Schema.parse({
        items: [{ ...base, workspaceId: undefined }],
        nextCursor: null,
      })
    ).toThrow()
  })
})

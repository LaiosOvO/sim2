import { describe, expect, it } from 'vitest'
import {
  approvalRoutesV1,
  approvalRouteV1Schema,
  decideApprovalBodyV1Schema,
  listApprovalsQueryV1Schema,
  startApprovalBodyV1Schema,
} from '../src/approvals'

describe('approval API contracts', () => {
  it('covers exactly the first eight W8 inventory IDs', () => {
    expect(approvalRoutesV1.map((route) => approvalRouteV1Schema.parse(route).inventoryId)).toEqual(
      [
        'API-0002',
        'API-0003',
        'API-0004',
        'API-0005',
        'API-0006',
        'API-0007',
        'API-0009',
        'API-0010',
      ]
    )
  })

  it('applies bounded list defaults', () => {
    expect(listApprovalsQueryV1Schema.parse({ workspaceId: 'workspace-1' })).toEqual({
      workspaceId: 'workspace-1',
      view: 'all',
      limit: 50,
    })
    expect(
      listApprovalsQueryV1Schema.safeParse({ workspaceId: 'workspace-1', limit: 101 }).success
    ).toBe(false)
  })

  it('requires rejection reasons and transfer targets at the boundary', () => {
    expect(
      decideApprovalBodyV1Schema.safeParse({ taskId: 'task-1', action: 'reject' }).success
    ).toBe(false)
    expect(
      decideApprovalBodyV1Schema.safeParse({ taskId: 'task-1', action: 'transfer' }).success
    ).toBe(false)
    expect(
      decideApprovalBodyV1Schema.safeParse({
        taskId: 'task-1',
        action: 'return',
        comment: 'Please revise',
      }).success
    ).toBe(true)
  })

  it('keeps start idempotency coordinates and defaults explicit', () => {
    expect(
      startApprovalBodyV1Schema.parse({
        workspaceId: 'workspace-1',
        workflowId: 'workflow-1',
        executionId: 'execution-1',
        contextId: 'context-1',
        definitionVersionId: 'version-1',
        title: 'Approval',
        content: 'Details',
      })
    ).toMatchObject({
      executionId: 'execution-1',
      contextId: 'context-1',
      businessType: 'workflow',
    })
  })
})

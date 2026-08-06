/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { assertMutable, checkPermission, persistOperation } = vi.hoisted(() => ({
  assertMutable: vi.fn(),
  checkPermission: vi.fn(),
  persistOperation: vi.fn(),
}))

vi.mock('@sim/platform-authz/workflow', () => ({
  assertWorkflowMutable: assertMutable,
  WorkflowLockedError: class WorkflowLockedError extends Error {},
}))

vi.mock('@/database/operations', () => ({
  persistWorkflowOperation: persistOperation,
}))

vi.mock('@/middleware/permissions', () => ({
  checkWorkflowOperationPermission: checkPermission,
}))

import { setupOperationsHandlers } from '@/handlers/operations'

describe('setupOperationsHandlers operation identity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertMutable.mockResolvedValue(undefined)
    checkPermission.mockResolvedValue({ allowed: true, role: 'write' })
    persistOperation.mockResolvedValue(undefined)
  })

  it('preserves the originating operationId in the remote broadcast and sender ack', async () => {
    const handlers: Record<string, (data: unknown) => Promise<void>> = {}
    const broadcast = { emit: vi.fn() }
    const socket = {
      id: 'socket-1',
      emit: vi.fn(),
      on: vi.fn((event: string, handler: (data: unknown) => Promise<void>) => {
        handlers[event] = handler
      }),
      to: vi.fn(() => broadcast),
    }
    const roomManager = {
      getUserSession: vi.fn().mockResolvedValue({
        userId: 'user-1',
        userName: 'Test User',
      }),
      getWorkflowIdForSocket: vi.fn().mockResolvedValue('workflow-1'),
      getWorkflowUsers: vi.fn().mockResolvedValue([{ socketId: 'socket-1', role: 'write' }]),
      hasWorkflowRoom: vi.fn().mockResolvedValue(true),
      isReady: vi.fn().mockReturnValue(true),
      updateRoomLastModified: vi.fn().mockResolvedValue(undefined),
      updateUserActivity: vi.fn().mockResolvedValue(undefined),
    }

    setupOperationsHandlers(
      socket as unknown as Parameters<typeof setupOperationsHandlers>[0],
      roomManager as unknown as Parameters<typeof setupOperationsHandlers>[1]
    )
    await handlers['workflow-operation']({
      operation: 'replace-state',
      operationId: 'operation-client-1',
      payload: { state: { blocks: {}, edges: [] } },
      target: 'workflow',
      timestamp: 123,
    })

    expect(broadcast.emit).toHaveBeenCalledWith(
      'workflow-operation',
      expect.objectContaining({
        metadata: expect.objectContaining({ operationId: 'operation-client-1' }),
      })
    )
    expect(socket.emit).toHaveBeenCalledWith(
      'operation-confirmed',
      expect.objectContaining({ operationId: 'operation-client-1' })
    )
  })
})

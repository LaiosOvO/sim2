import type { AuthenticatedRequestContext } from '@sim/api-contracts/auth'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const authorizeWorkflowByWorkspacePermission = vi.hoisted(() => vi.fn())

vi.mock('@sim/platform-authz/workflow', () => ({
  authorizeWorkflowByWorkspacePermission,
}))

import { createPlatformWorkflowReadAuthorizer } from '@/infrastructure/postgres/repositories/platform-workflow-read-authorizer'

const sessionContext: AuthenticatedRequestContext = {
  authContextVersion: 1,
  authenticationMethod: 'session',
  actor: { id: 'user-1', type: 'user' },
  requestId: 'request-session',
  permissions: [],
  activeOrganizationId: null,
}

const workspaceKeyContext: AuthenticatedRequestContext = {
  authContextVersion: 1,
  authenticationMethod: 'api-key',
  actor: { id: 'user-1', type: 'user' },
  requestId: 'request-workspace-key',
  credentialId: 'key-1',
  keyType: 'workspace',
  workspaceId: 'workspace-1',
  permissions: [],
}

describe('platform workflow read authorizer', () => {
  beforeEach(() => {
    authorizeWorkflowByWorkspacePermission.mockReset()
  })

  it('delegates user access to the canonical workflow authorization seam', async () => {
    authorizeWorkflowByWorkspacePermission.mockResolvedValue({
      allowed: true,
      status: 200,
      workflow: { workspaceId: 'workspace-1' },
      workspacePermission: 'read',
    })

    await expect(
      createPlatformWorkflowReadAuthorizer({
        scopes: { readScope: async () => ({ workspaceId: 'workspace-1' }) },
      }).authorize(sessionContext, 'workflow-1')
    ).resolves.toEqual({ allowed: true, workspaceId: 'workspace-1' })
    expect(authorizeWorkflowByWorkspacePermission).toHaveBeenCalledWith({
      workflowId: 'workflow-1',
      userId: 'user-1',
      action: 'read',
    })
  })

  it('preserves a canonical workflow denial without reading paused execution state', async () => {
    authorizeWorkflowByWorkspacePermission.mockResolvedValue({
      allowed: false,
      status: 404,
      message: 'Workflow not found',
      workflow: null,
      workspacePermission: null,
    })

    await expect(
      createPlatformWorkflowReadAuthorizer({
        scopes: { readScope: async () => ({ workspaceId: 'workspace-1' }) },
      }).authorize(sessionContext, 'workflow-missing')
    ).resolves.toEqual({
      allowed: false,
      status: 404,
      message: 'Workflow not found',
    })
  })

  it('prevents a workspace API key from crossing its credential scope before permission lookup', async () => {
    authorizeWorkflowByWorkspacePermission.mockResolvedValue({
      allowed: false,
      status: 403,
      message: 'Unauthorized: Access denied to read this workflow',
      workflow: { workspaceId: 'workspace-2' },
      workspacePermission: null,
    })

    await expect(
      createPlatformWorkflowReadAuthorizer({
        scopes: { readScope: async () => ({ workspaceId: 'workspace-2' }) },
      }).authorize(workspaceKeyContext, 'workflow-2')
    ).resolves.toEqual({
      allowed: false,
      status: 403,
      message: 'API key is not authorized for this workspace',
    })
    expect(authorizeWorkflowByWorkspacePermission).not.toHaveBeenCalled()
  })

  it('freezes missing and unattached workflow precedence before canonical authorization', async () => {
    const missing = createPlatformWorkflowReadAuthorizer({
      scopes: { readScope: async () => null },
    })
    await expect(missing.authorize(sessionContext, 'missing')).resolves.toEqual({
      allowed: false,
      status: 404,
      message: 'Workflow not found',
    })

    const personal = createPlatformWorkflowReadAuthorizer({
      scopes: { readScope: async () => ({ workspaceId: null }) },
    })
    await expect(personal.authorize(sessionContext, 'personal')).resolves.toEqual({
      allowed: false,
      status: 403,
      message:
        'This workflow is not attached to a workspace. Personal workflows are deprecated and cannot be accessed.',
    })
    expect(authorizeWorkflowByWorkspacePermission).not.toHaveBeenCalled()
  })

  it('rejects non-user actors before calling workspace authorization', async () => {
    const publicContext: AuthenticatedRequestContext = {
      authContextVersion: 1,
      authenticationMethod: 'public-token',
      actor: { id: 'public-1', type: 'public' },
      requestId: 'request-public',
      credentialId: 'share-1',
      workspaceId: 'workspace-1',
      organizationId: null,
      resourceType: 'workflow',
      resourceId: 'workflow-1',
      permissions: [],
    }

    await expect(
      createPlatformWorkflowReadAuthorizer({
        scopes: { readScope: vi.fn() },
      }).authorize(publicContext, 'workflow-1')
    ).resolves.toEqual({
      allowed: false,
      status: 401,
      message: 'Unauthorized',
    })
    expect(authorizeWorkflowByWorkspacePermission).not.toHaveBeenCalled()
  })
})

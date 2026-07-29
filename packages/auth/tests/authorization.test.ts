import type { AuthenticatedRequestContext } from '@sim/api-contracts/auth'
import { describe, expect, it, vi } from 'vitest'
import { authorizeRequestContext, type RequestAccessResolver } from '../src/authorization'

const workspaceKeyContext: AuthenticatedRequestContext = {
  authContextVersion: 1,
  requestId: 'request-key',
  authenticationMethod: 'api-key',
  actor: { id: 'user-1', type: 'user' },
  credentialId: 'key-1',
  keyType: 'workspace',
  workspaceId: 'workspace-a',
  permissions: [],
}

const sessionContext: AuthenticatedRequestContext = {
  authContextVersion: 1,
  requestId: 'request-session',
  authenticationMethod: 'session',
  actor: { id: 'user-1', type: 'user' },
  activeOrganizationId: 'org-a',
  permissions: [],
}

function resolver(): RequestAccessResolver {
  return {
    workspacePermission: vi.fn(async (_actorId, workspaceId) =>
      workspaceId === 'workspace-a' ? 'admin' : null
    ),
    organizationRole: vi.fn(async (_actorId, organizationId) =>
      organizationId === 'org-a' ? 'member' : null
    ),
    workflow: vi.fn(async (workflowId) =>
      workflowId === 'workflow-a'
        ? {
            workflowId,
            workspaceId: 'workspace-a',
            organizationId: 'org-a',
          }
        : null
    ),
  }
}

describe('request context authorization', () => {
  it('prevents a workspace key from crossing its credential scope', async () => {
    const result = await authorizeRequestContext(workspaceKeyContext, resolver(), {
      type: 'workspace',
      workspaceId: 'workspace-b',
      access: 'read',
    })

    expect(result).toMatchObject({
      allowed: false,
      error: { code: 'workspace_access_denied', status: 403 },
    })
  })

  it('allows an organization member to read only their organization', async () => {
    const access = resolver()
    const own = await authorizeRequestContext(sessionContext, access, {
      type: 'organization',
      organizationId: 'org-a',
      access: 'read',
    })
    const crossTenant = await authorizeRequestContext(sessionContext, access, {
      type: 'organization',
      organizationId: 'org-b',
      access: 'read',
    })

    expect(own.allowed).toBe(true)
    expect(crossTenant).toMatchObject({
      allowed: false,
      error: { code: 'organization_access_denied', status: 403 },
    })
  })

  it('resolves workflow access through its owning workspace and conceals missing workflows', async () => {
    const access = resolver()
    const own = await authorizeRequestContext(sessionContext, access, {
      type: 'workflow',
      workflowId: 'workflow-a',
      access: 'write',
    })
    const missing = await authorizeRequestContext(sessionContext, access, {
      type: 'workflow',
      workflowId: 'workflow-missing',
      access: 'read',
    })

    expect(own.allowed).toBe(true)
    expect(missing).toMatchObject({
      allowed: false,
      error: { code: 'subject_not_found', status: 404 },
    })
  })

  it('requires explicit internal scopes and keeps public tokens read-only', async () => {
    const access = resolver()
    const internal: AuthenticatedRequestContext = {
      authContextVersion: 1,
      requestId: 'request-internal',
      authenticationMethod: 'internal',
      actor: { id: 'executor', type: 'service' },
      service: 'executor',
      scopes: ['workspace:workspace-a:read'],
      permissions: ['workspace:workspace-a:read'],
    }
    const publicToken: AuthenticatedRequestContext = {
      authContextVersion: 1,
      requestId: 'request-public',
      authenticationMethod: 'public-token',
      actor: { id: 'public-share:share-1', type: 'public' },
      credentialId: 'share-1',
      workspaceId: 'workspace-a',
      organizationId: 'org-a',
      resourceType: 'file',
      resourceId: 'file-1',
      permissions: ['resource:read'],
    }

    await expect(
      authorizeRequestContext(internal, access, {
        type: 'workspace',
        workspaceId: 'workspace-a',
        access: 'read',
      })
    ).resolves.toMatchObject({ allowed: true })
    await expect(
      authorizeRequestContext(internal, access, {
        type: 'workspace',
        workspaceId: 'workspace-a',
        access: 'write',
      })
    ).resolves.toMatchObject({ allowed: false })
    await expect(
      authorizeRequestContext(publicToken, access, {
        type: 'workspace',
        workspaceId: 'workspace-a',
        access: 'read',
      })
    ).resolves.toMatchObject({ allowed: false })
    await expect(
      authorizeRequestContext(publicToken, access, {
        type: 'resource',
        resourceType: 'file',
        resourceId: 'file-1',
        access: 'read',
      })
    ).resolves.toMatchObject({ allowed: true })
    await expect(
      authorizeRequestContext(publicToken, access, {
        type: 'resource',
        resourceType: 'file',
        resourceId: 'file-2',
        access: 'read',
      })
    ).resolves.toMatchObject({
      allowed: false,
      error: { code: 'resource_access_denied' },
    })
  })
})

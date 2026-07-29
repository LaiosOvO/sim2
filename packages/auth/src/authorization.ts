import type { AuthenticatedRequestContext, AuthenticationError } from '@sim/api-contracts/auth'

export type AccessLevel = 'read' | 'write' | 'admin'

export type AuthorizationTarget =
  | { type: 'workspace'; workspaceId: string; access: AccessLevel }
  | { type: 'organization'; organizationId: string; access: AccessLevel }
  | { type: 'workflow'; workflowId: string; access: AccessLevel }
  | { type: 'resource'; resourceType: string; resourceId: string; access: 'read' }

export interface WorkflowAccessRecord {
  workflowId: string
  workspaceId: string
  organizationId: string | null
}

export interface RequestAccessResolver {
  workspacePermission(actorId: string, workspaceId: string): Promise<AccessLevel | null>
  organizationRole(actorId: string, organizationId: string): Promise<string | null>
  workflow(workflowId: string): Promise<WorkflowAccessRecord | null>
}

export type AuthorizationResult =
  | { allowed: true; context: AuthenticatedRequestContext; target: AuthorizationTarget }
  | { allowed: false; error: AuthenticationError }

const rank: Record<AccessLevel, number> = { read: 1, write: 2, admin: 3 }

function denied(
  code:
    | 'workspace_access_denied'
    | 'organization_access_denied'
    | 'workflow_access_denied'
    | 'resource_access_denied'
    | 'subject_not_found',
  status: 403 | 404,
  message: string
): AuthorizationResult {
  return {
    allowed: false,
    error: { code, status, message, retryable: false },
  }
}

function internalScopeAllows(
  context: AuthenticatedRequestContext,
  target: AuthorizationTarget
): boolean {
  if (context.authenticationMethod !== 'internal') return false
  if (context.scopes.includes('platform:*')) return true
  const targetId =
    target.type === 'workspace'
      ? target.workspaceId
      : target.type === 'organization'
        ? target.organizationId
        : target.type === 'workflow'
          ? target.workflowId
          : `${target.resourceType}:${target.resourceId}`
  return (
    context.scopes.includes(`${target.type}:*`) ||
    context.scopes.includes(`${target.type}:${targetId}:*`) ||
    context.scopes.includes(`${target.type}:${targetId}:${target.access}`)
  )
}

function publicTokenAllows(
  context: AuthenticatedRequestContext,
  target: AuthorizationTarget
): boolean {
  if (context.authenticationMethod !== 'public-token' || target.access !== 'read') return false
  return (
    target.type === 'resource' &&
    context.resourceType === target.resourceType &&
    context.resourceId === target.resourceId
  )
}

async function authorizeWorkspace(
  context: AuthenticatedRequestContext,
  resolver: RequestAccessResolver,
  workspaceId: string,
  access: AccessLevel
): Promise<AuthorizationResult> {
  const target = { type: 'workspace', workspaceId, access } as const
  if (
    context.authenticationMethod === 'api-key' &&
    context.keyType === 'workspace' &&
    context.workspaceId !== workspaceId
  ) {
    return denied('workspace_access_denied', 403, 'Workspace access denied')
  }
  if (publicTokenAllows(context, target) || internalScopeAllows(context, target)) {
    return { allowed: true, context, target }
  }
  if (context.actor.type !== 'user') {
    return denied('workspace_access_denied', 403, 'Workspace access denied')
  }
  const permission = await resolver.workspacePermission(context.actor.id, workspaceId)
  return permission && rank[permission] >= rank[access]
    ? { allowed: true, context, target }
    : denied('workspace_access_denied', 403, 'Workspace access denied')
}

async function authorizeOrganization(
  context: AuthenticatedRequestContext,
  resolver: RequestAccessResolver,
  organizationId: string,
  access: AccessLevel
): Promise<AuthorizationResult> {
  const target = { type: 'organization', organizationId, access } as const
  if (publicTokenAllows(context, target) || internalScopeAllows(context, target)) {
    return { allowed: true, context, target }
  }
  if (context.actor.type !== 'user') {
    return denied('organization_access_denied', 403, 'Organization access denied')
  }
  const role = await resolver.organizationRole(context.actor.id, organizationId)
  const allowed = role !== null && (access === 'read' || role === 'owner' || role === 'admin')
  return allowed
    ? { allowed: true, context, target }
    : denied('organization_access_denied', 403, 'Organization access denied')
}

/**
 * Authorizes an already authenticated context without re-reading credentials.
 * All resource routes use this same target model, so workspace-key scope,
 * public-token scope and internal service scopes cannot drift route-by-route.
 */
export async function authorizeRequestContext(
  context: AuthenticatedRequestContext,
  resolver: RequestAccessResolver,
  target: AuthorizationTarget
): Promise<AuthorizationResult> {
  if (target.type === 'workspace') {
    return authorizeWorkspace(context, resolver, target.workspaceId, target.access)
  }
  if (target.type === 'organization') {
    return authorizeOrganization(context, resolver, target.organizationId, target.access)
  }
  if (target.type === 'resource') {
    if (publicTokenAllows(context, target) || internalScopeAllows(context, target)) {
      return { allowed: true, context, target }
    }
    return denied('resource_access_denied', 403, 'Resource access denied')
  }

  const workflow = await resolver.workflow(target.workflowId)
  if (!workflow) return denied('subject_not_found', 404, 'Workflow not found')
  const workspaceResult = await authorizeWorkspace(
    context,
    resolver,
    workflow.workspaceId,
    target.access
  )
  return workspaceResult.allowed
    ? { allowed: true, context, target }
    : denied('workflow_access_denied', 403, 'Workflow access denied')
}

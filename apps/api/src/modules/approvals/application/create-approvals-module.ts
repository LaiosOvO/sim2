import {
  approvalDefinitionParamsV1Schema,
  approvalParamsV1Schema,
  createApprovalDefinitionBodyV1Schema,
  createApprovalDefinitionResponseV1Schema,
  createApprovalDefinitionVersionBodyV1Schema,
  createApprovalDefinitionVersionResponseV1Schema,
  decideApprovalBodyV1Schema,
  decideApprovalResponseV1Schema,
  listApprovalAuditLogsQueryV1Schema,
  listApprovalAuditLogsResponseV1Schema,
  listApprovalDefinitionsQueryV1Schema,
  listApprovalDefinitionsResponseV1Schema,
  listApprovalsQueryV1Schema,
  listApprovalsResponseV1Schema,
  publishApprovalDefinitionVersionParamsV1Schema,
  retryApprovalResumeBodyV1Schema,
  retryApprovalResumeResponseV1Schema,
  startApprovalBodyV1Schema,
  startApprovalResponseV1Schema,
} from '@sim/api-contracts/approvals'
import type { RequestAuthenticator } from '@sim/auth/request-context'
import type { ApiRequestContext } from '@/http/request-context'
import { ApprovalDomainError } from '@/modules/approvals/errors'
import type {
  ApprovalAccessPort,
  ApprovalAuditPort,
  ApprovalEffectsPort,
  ApprovalRepository,
  ApprovalResumeCommand,
  ApprovalWorkspaceAccess,
} from '@/modules/approvals/ports'

export interface ApprovalsModule {
  handle(request: Request, context: ApiRequestContext): Promise<Response | undefined>
}

export interface ApprovalsModuleDependencies {
  authentication: RequestAuthenticator
  access: ApprovalAccessPort
  repository: ApprovalRepository
  resume: ApprovalResumeCommand
  effects: ApprovalEffectsPort
  audit: ApprovalAuditPort
}

interface Match {
  inventoryId:
    | 'API-0002'
    | 'API-0003'
    | 'API-0004'
    | 'API-0005'
    | 'API-0006'
    | 'API-0007'
    | 'API-0009'
    | 'API-0010'
  params: Record<string, string>
}

function matchRoute(pathname: string, method: string): Match | null {
  let match = /^\/api\/approvals\/([^/]+)\/decisions$/.exec(pathname)
  if (match && method === 'POST') {
    return { inventoryId: 'API-0002', params: { approvalId: decodeURIComponent(match[1]!) } }
  }
  match = /^\/api\/approvals\/([^/]+)\/resume$/.exec(pathname)
  if (match && method === 'POST') {
    return { inventoryId: 'API-0003', params: { approvalId: decodeURIComponent(match[1]!) } }
  }
  if (pathname === '/api/approvals/audit-logs' && method === 'GET') {
    return { inventoryId: 'API-0004', params: {} }
  }
  match = /^\/api\/approvals\/definitions\/([^/]+)\/versions\/([^/]+)\/publish$/.exec(pathname)
  if (match && method === 'POST') {
    return {
      inventoryId: 'API-0005',
      params: {
        definitionId: decodeURIComponent(match[1]!),
        versionId: decodeURIComponent(match[2]!),
      },
    }
  }
  match = /^\/api\/approvals\/definitions\/([^/]+)\/versions$/.exec(pathname)
  if (match && method === 'POST') {
    return { inventoryId: 'API-0006', params: { definitionId: decodeURIComponent(match[1]!) } }
  }
  if (pathname === '/api/approvals/definitions' && ['GET', 'POST'].includes(method)) {
    return { inventoryId: 'API-0007', params: {} }
  }
  if (pathname === '/api/approvals' && method === 'GET') {
    return { inventoryId: 'API-0009', params: {} }
  }
  if (pathname === '/api/approvals/start' && method === 'POST') {
    return { inventoryId: 'API-0010', params: {} }
  }
  return null
}

function observed(response: Response, inventoryId: Match['inventoryId']): Response {
  const headers = new Headers(response.headers)
  headers.set('x-sim-api-module', 'approvals')
  headers.set('x-sim-api-inventory-id', inventoryId)
  headers.set('x-sim-api-backend', 'native')
  return new Response(response.body, { status: response.status, headers })
}

function error(message: string, status: number, details?: unknown): Response {
  return Response.json({ error: message, ...(details ? { details } : {}) }, { status })
}

async function json(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return {}
  }
}

function canWrite(access: ApprovalWorkspaceAccess): boolean {
  return access.permission === 'write' || access.permission === 'admin'
}

function domainErrorResponse(cause: unknown): Response {
  if (!(cause instanceof ApprovalDomainError)) return error('Internal server error', 500)
  if (
    cause.code === 'APPROVAL_NOT_FOUND' ||
    cause.code === 'APPROVAL_TASK_NOT_FOUND' ||
    cause.code === 'APPROVAL_VERSION_NOT_FOUND' ||
    cause.code === 'APPROVAL_DEFINITION_NOT_FOUND'
  ) {
    return error(cause.message, 404)
  }
  if (cause.code === 'APPROVAL_TASK_MISMATCH') return error(cause.message, 403)
  if (cause.code === 'APPROVAL_INVALID') return error(cause.message, 400)
  return error(cause.message, 409)
}

async function authenticate(
  request: Request,
  context: ApiRequestContext,
  dependencies: ApprovalsModuleDependencies,
  hybrid: boolean
) {
  return dependencies.authentication.authenticate({
    request,
    requestId: context.requestId,
    policy: hybrid
      ? {
          mode: 'hybrid',
          allowed: ['session', 'api-key', 'internal'],
          internalActor: 'user',
        }
      : { mode: 'session' },
  })
}

async function resumeApproval(
  approvalId: string,
  requestId: string,
  dependencies: ApprovalsModuleDependencies
) {
  const claim = await dependencies.repository.claimResume(approvalId)
  try {
    const result = await dependencies.resume.run({
      approvalId,
      workflowId: claim.workflowId,
      executionId: claim.executionId,
      contextId: claim.contextId,
      decision: claim.approvalStatus,
      requestId,
    })
    await dependencies.repository.markResumeStarted(approvalId, result.resumeExecutionId)
    return { ...result, recoveredStalledClaim: claim.recoveredStalledClaim }
  } catch (cause) {
    await dependencies.repository.markResumeFailed(
      approvalId,
      cause instanceof Error ? cause.message : 'Approval resume failed'
    )
    throw cause
  }
}

export function createApprovalsModule(dependencies: ApprovalsModuleDependencies): ApprovalsModule {
  return {
    async handle(request, context) {
      const url = new URL(request.url)
      const route = matchRoute(url.pathname, request.method)
      if (!route) {
        if (url.pathname.startsWith('/api/approvals')) {
          return new Response(null, { status: 405 })
        }
        return undefined
      }

      const authentication = await authenticate(
        request,
        context,
        dependencies,
        route.inventoryId === 'API-0009' || route.inventoryId === 'API-0010'
      )
      if (!authentication.ok || authentication.context.actor.type !== 'user') {
        const status = authentication.ok ? 401 : authentication.error.status
        return observed(error('Unauthorized', status), route.inventoryId)
      }
      const actor = authentication.context.actor

      try {
        if (route.inventoryId === 'API-0009') {
          const parsed = listApprovalsQueryV1Schema.safeParse(Object.fromEntries(url.searchParams))
          if (!parsed.success) {
            return observed(error('Invalid request', 400, parsed.error.issues), route.inventoryId)
          }
          const access = await dependencies.access.workspace(actor.id, parsed.data.workspaceId)
          if (!access) return observed(error('Access denied', 403), route.inventoryId)
          if (!access.organizationId) {
            return observed(
              error('Approval center requires an organization workspace', 400),
              route.inventoryId
            )
          }
          const admin = access.organizationRole === 'owner' || access.organizationRole === 'admin'
          if (
            !admin &&
            !(await dependencies.access.hasBusinessCapability({
              actorId: actor.id,
              organizationId: access.organizationId,
              workspaceId: parsed.data.workspaceId,
              menuCode: 'approvals',
              permissionCode: 'pm.approval.read',
            }))
          ) {
            return observed(error('Access denied', 403), route.inventoryId)
          }
          const rows = await dependencies.repository.listApprovals({
            ...parsed.data,
            actorId: actor.id,
          })
          const approvals = admin
            ? rows
            : await dependencies.access.filterVisibleApprovals({
                actorId: actor.id,
                organizationId: access.organizationId,
                workspaceId: parsed.data.workspaceId,
                approvals: rows,
              })
          return observed(
            Response.json(listApprovalsResponseV1Schema.parse({ approvals })),
            route.inventoryId
          )
        }

        if (route.inventoryId === 'API-0010') {
          const parsed = startApprovalBodyV1Schema.safeParse(await json(request))
          if (!parsed.success) {
            return observed(error('Invalid request', 400, parsed.error.issues), route.inventoryId)
          }
          const access = await dependencies.access.workspace(actor.id, parsed.data.workspaceId)
          if (!access || !canWrite(access)) {
            return observed(error('Workspace write permission required', 403), route.inventoryId)
          }
          const approval = await dependencies.repository.start(parsed.data, actor.id)
          await dependencies.effects.approvalStarted(approval)
          await dependencies.audit.record({
            request,
            requestId: context.requestId,
            actor,
            workspaceId: approval.workspaceId,
            organizationId: access.organizationId,
            action: 'APPROVAL_INSTANCE_STARTED',
            resourceId: approval.id,
            resourceName: approval.title,
            metadata: { executionId: approval.executionId, workflowId: approval.workflowId },
          })
          return observed(
            Response.json(startApprovalResponseV1Schema.parse({ approval }), { status: 201 }),
            route.inventoryId
          )
        }

        if (route.inventoryId === 'API-0007') {
          if (request.method === 'GET') {
            const parsed = listApprovalDefinitionsQueryV1Schema.safeParse(
              Object.fromEntries(url.searchParams)
            )
            if (!parsed.success) {
              return observed(error('Invalid request', 400, parsed.error.issues), route.inventoryId)
            }
            const access = await dependencies.access.workspace(actor.id, parsed.data.workspaceId)
            if (!access) {
              return observed(error('Workspace access denied', 403), route.inventoryId)
            }
            const definitions = await dependencies.repository.listDefinitions(
              parsed.data.workspaceId
            )
            return observed(
              Response.json(listApprovalDefinitionsResponseV1Schema.parse({ definitions })),
              route.inventoryId
            )
          }
          const parsed = createApprovalDefinitionBodyV1Schema.safeParse(await json(request))
          if (!parsed.success) {
            return observed(error('Invalid request', 400, parsed.error.issues), route.inventoryId)
          }
          const access = await dependencies.access.workspace(actor.id, parsed.data.workspaceId)
          if (!access || access.permission !== 'admin') {
            return observed(error('Workspace admin permission required', 403), route.inventoryId)
          }
          const definition = await dependencies.repository.createDefinition(parsed.data, actor.id)
          await dependencies.audit.record({
            request,
            requestId: context.requestId,
            actor,
            workspaceId: parsed.data.workspaceId,
            organizationId: access.organizationId,
            action: 'APPROVAL_DEFINITION_CREATED',
            resourceId: definition.id,
            resourceName: definition.name,
          })
          return observed(
            Response.json(createApprovalDefinitionResponseV1Schema.parse({ definition }), {
              status: 201,
            }),
            route.inventoryId
          )
        }

        if (route.inventoryId === 'API-0006' || route.inventoryId === 'API-0005') {
          const params =
            route.inventoryId === 'API-0006'
              ? approvalDefinitionParamsV1Schema.safeParse(route.params)
              : publishApprovalDefinitionVersionParamsV1Schema.safeParse(route.params)
          if (!params.success) {
            return observed(error('Invalid request', 400, params.error.issues), route.inventoryId)
          }
          const workspaceId = await dependencies.repository.getDefinitionWorkspace(
            params.data.definitionId
          )
          if (!workspaceId) {
            return observed(error('Approval definition not found', 404), route.inventoryId)
          }
          const access = await dependencies.access.workspace(actor.id, workspaceId)
          if (!access || access.permission !== 'admin') {
            return observed(error('Workspace admin permission required', 403), route.inventoryId)
          }
          if (route.inventoryId === 'API-0006') {
            const body = createApprovalDefinitionVersionBodyV1Schema.safeParse(await json(request))
            if (!body.success) {
              return observed(error('Invalid request', 400, body.error.issues), route.inventoryId)
            }
            const version = await dependencies.repository.createVersion(
              params.data.definitionId,
              body.data.spec,
              actor.id
            )
            await dependencies.audit.record({
              request,
              requestId: context.requestId,
              actor,
              workspaceId,
              organizationId: access.organizationId,
              action: 'APPROVAL_DEFINITION_VERSION_CREATED',
              resourceId: version.id,
              metadata: { definitionId: params.data.definitionId, version: version.version },
            })
            return observed(
              Response.json(createApprovalDefinitionVersionResponseV1Schema.parse({ version }), {
                status: 201,
              }),
              route.inventoryId
            )
          }
          if (!('versionId' in params.data) || typeof params.data.versionId !== 'string') {
            throw new Error('versionId is unavailable')
          }
          const version = await dependencies.repository.publishVersion(
            params.data.definitionId,
            params.data.versionId
          )
          await dependencies.audit.record({
            request,
            requestId: context.requestId,
            actor,
            workspaceId,
            organizationId: access.organizationId,
            action: 'APPROVAL_DEFINITION_VERSION_PUBLISHED',
            resourceId: version.id,
            metadata: { definitionId: params.data.definitionId, version: version.version },
          })
          return observed(
            Response.json(createApprovalDefinitionVersionResponseV1Schema.parse({ version })),
            route.inventoryId
          )
        }

        if (route.inventoryId === 'API-0004') {
          const parsed = listApprovalAuditLogsQueryV1Schema.safeParse(
            Object.fromEntries(url.searchParams)
          )
          if (!parsed.success) {
            return observed(error('Invalid request', 400, parsed.error.issues), route.inventoryId)
          }
          const access = await dependencies.access.workspace(actor.id, parsed.data.workspaceId)
          if (!access) {
            return observed(error('Workspace access denied', 403), route.inventoryId)
          }
          if (!access.organizationId) {
            return observed(
              error('Approval audit logs require an organization workspace', 400),
              route.inventoryId
            )
          }
          const admin = access.organizationRole === 'owner' || access.organizationRole === 'admin'
          if (
            !admin &&
            !(await dependencies.access.hasBusinessCapability({
              actorId: actor.id,
              organizationId: access.organizationId,
              workspaceId: parsed.data.workspaceId,
              menuCode: 'approval_logs',
              permissionCode: 'pm.approval.audit.read',
            }))
          ) {
            return observed(error('Access denied', 403), route.inventoryId)
          }
          const result = await dependencies.audit.list({
            ...parsed.data,
            actorId: actor.id,
          })
          return observed(
            Response.json(listApprovalAuditLogsResponseV1Schema.parse(result)),
            route.inventoryId
          )
        }

        const params = approvalParamsV1Schema.safeParse(route.params)
        if (!params.success) {
          return observed(error('Invalid request', 400, params.error.issues), route.inventoryId)
        }
        const approval = await dependencies.repository.getApproval(params.data.approvalId)
        if (!approval) return observed(error('Approval not found', 404), route.inventoryId)
        const access = await dependencies.access.workspace(actor.id, approval.workspaceId)
        if (!access) {
          return observed(error('Workspace access denied', 403), route.inventoryId)
        }

        if (route.inventoryId === 'API-0002') {
          const body = decideApprovalBodyV1Schema.safeParse(await json(request))
          if (!body.success) {
            return observed(error('Invalid request', 400, body.error.issues), route.inventoryId)
          }
          const decision = await dependencies.repository.decide(approval.id, body.data, actor.id)
          let response: {
            status: 'pending' | 'terminal' | 'resuming' | 'queued' | 'already_decided'
            approvalStatus: typeof decision.approvalStatus
            approvalId: string
            resumeExecutionId?: string
          } = {
            status: decision.status,
            approvalStatus: decision.approvalStatus,
            approvalId: decision.approvalId,
          }
          if (decision.shouldResume) {
            const resumed = await resumeApproval(approval.id, context.requestId, dependencies)
            response = {
              status: resumed.status,
              approvalStatus: decision.approvalStatus,
              approvalId: approval.id,
              resumeExecutionId: resumed.resumeExecutionId,
            }
          }
          await dependencies.effects.approvalDecided({
            approvalId: approval.id,
            action: body.data.action,
            actorId: actor.id,
          })
          await dependencies.audit.record({
            request,
            requestId: context.requestId,
            actor,
            workspaceId: approval.workspaceId,
            organizationId: access.organizationId,
            action: `APPROVAL_${body.data.action.toUpperCase()}`,
            resourceId: approval.id,
            resourceName: approval.title,
            metadata: { taskId: body.data.taskId, result: response.status },
          })
          return observed(
            Response.json(decideApprovalResponseV1Schema.parse(response)),
            route.inventoryId
          )
        }

        const body = retryApprovalResumeBodyV1Schema.safeParse(await json(request))
        if (!body.success) {
          return observed(error('Invalid request', 400, body.error.issues), route.inventoryId)
        }
        const resumed = await resumeApproval(approval.id, context.requestId, dependencies)
        await dependencies.audit.record({
          request,
          requestId: context.requestId,
          actor,
          workspaceId: approval.workspaceId,
          organizationId: access.organizationId,
          action: 'APPROVAL_RESUME_RETRIED',
          resourceId: approval.id,
          resourceName: approval.title,
          metadata: {
            reason: body.data.reason,
            recoveredStalledClaim: resumed.recoveredStalledClaim,
          },
        })
        return observed(
          Response.json(
            retryApprovalResumeResponseV1Schema.parse({
              status: resumed.status,
              approvalId: approval.id,
              resumeExecutionId: resumed.resumeExecutionId,
              recoveredStalledClaim: resumed.recoveredStalledClaim,
            })
          ),
          route.inventoryId
        )
      } catch (cause) {
        return observed(domainErrorResponse(cause), route.inventoryId)
      }
    },
  }
}

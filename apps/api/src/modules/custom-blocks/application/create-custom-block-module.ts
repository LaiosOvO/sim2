import {
  type CustomBlockRouteV1,
  customBlockIdParamsV1Schema,
  listCustomBlocksQueryV1Schema,
  publishCustomBlockBodyV1Schema,
  updateCustomBlockBodyV1Schema,
} from '@sim/api-contracts/custom-blocks'
import { authorizeRequestContext, type RequestAccessResolver } from '@sim/auth/authorization'
import type { RequestAuthenticator } from '@sim/auth/request-context'
import { createLogger } from '@sim/logger'
import { generateId, generateShortId } from '@sim/utils/id'
import type { ApiRequestContext } from '@/http/request-context'
import { CustomBlockDomainError } from '@/modules/custom-blocks/errors'
import type { CustomBlockAuditSink } from '@/modules/custom-blocks/ports/custom-block-audit'
import type {
  BlockVisibilityReader,
  CustomBlockEntitlement,
  CustomBlockFeatureGate,
  PlatformAdminReader,
} from '@/modules/custom-blocks/ports/custom-block-policy'
import type { CustomBlockRepository } from '@/modules/custom-blocks/ports/custom-block-repository'

const logger = createLogger('CustomBlocksAPI')
const customBlockTypePrefix = 'custom_block_'

export interface CustomBlockModule {
  handle(request: Request, context: ApiRequestContext): Promise<Response | undefined>
}

export interface CustomBlockModuleDependencies {
  authentication: RequestAuthenticator
  access: RequestAccessResolver
  repository: CustomBlockRepository
  feature: CustomBlockFeatureGate
  entitlement: CustomBlockEntitlement
  platformAdmins: PlatformAdminReader
  visibility: BlockVisibilityReader
  audit: CustomBlockAuditSink
  generateId?: () => string
  generateTypeSuffix?: () => string
}

interface MatchedRoute {
  inventoryId: CustomBlockRouteV1['inventoryId']
  id?: string
  allowed: readonly string[]
  allowHeader: string
}

function matchRoute(pathname: string): MatchedRoute | null {
  if (pathname === '/api/blocks/visibility') {
    return {
      inventoryId: 'API-0045',
      allowed: ['GET'],
      allowHeader: 'GET, HEAD, OPTIONS',
    }
  }
  if (pathname === '/api/custom-blocks') {
    return {
      inventoryId: 'API-0096',
      allowed: ['GET', 'POST'],
      allowHeader: 'GET, HEAD, OPTIONS, POST',
    }
  }
  const usage = /^\/api\/custom-blocks\/([^/]+)\/usages$/.exec(pathname)
  if (usage) {
    return {
      inventoryId: 'API-0095',
      id: usage[1],
      allowed: ['GET'],
      allowHeader: 'GET, HEAD, OPTIONS',
    }
  }
  const manage = /^\/api\/custom-blocks\/([^/]+)$/.exec(pathname)
  if (manage) {
    return {
      inventoryId: 'API-0094',
      id: manage[1],
      allowed: ['PATCH', 'DELETE'],
      allowHeader: 'DELETE, OPTIONS, PATCH',
    }
  }
  return null
}

function observed(response: Response, inventoryId: MatchedRoute['inventoryId']): Response {
  const headers = new Headers(response.headers)
  headers.set('x-sim-api-backend', 'native')
  headers.set('x-sim-api-inventory-id', inventoryId)
  headers.set('x-sim-api-module', 'custom-blocks')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status })
}

async function parseJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new CustomBlockDomainError('Request body must be valid JSON')
  }
}

function queryValue(url: URL, name: string): string | string[] | null {
  const values = url.searchParams.getAll(name)
  if (values.length > 1) return values
  return values[0] ?? null
}

function validationError(error: { issues: readonly unknown[] }): Response {
  return Response.json({ error: 'Validation error', details: error.issues }, { status: 400 })
}

async function authenticate(
  request: Request,
  requestId: string,
  dependencies: CustomBlockModuleDependencies
) {
  const sessionHeaders = new Headers(request.headers)
  sessionHeaders.delete('x-api-key')
  sessionHeaders.delete('authorization')
  const sessionRequest = new Request(request.url, {
    method: request.method,
    headers: sessionHeaders,
    signal: request.signal,
  })
  return dependencies.authentication.authenticate({
    request: sessionRequest,
    requestId,
    policy: { mode: 'session' },
  })
}

async function authorizeWorkspace(
  authenticationContext: Awaited<ReturnType<typeof authenticate>> & { ok: true },
  workspaceId: string,
  access: 'read' | 'admin',
  dependencies: CustomBlockModuleDependencies
): Promise<Response | null> {
  const authorization = await authorizeRequestContext(
    authenticationContext.context,
    dependencies.access,
    { type: 'workspace', workspaceId, access }
  )
  if (authorization.allowed) return null
  return jsonError(
    access === 'admin' ? 'Admin permissions required' : 'Access denied',
    authorization.error.status === 404 ? 403 : authorization.error.status
  )
}

async function authorizeManage(
  actorId: string,
  authenticationContext: Awaited<ReturnType<typeof authenticate>> & { ok: true },
  id: string,
  dependencies: CustomBlockModuleDependencies
) {
  const manage = await dependencies.repository.findManageContext(id)
  if (!manage) return { error: jsonError('Not found', 404), manage: null }
  if (
    !(await dependencies.feature.isEnabled({
      userId: actorId,
      organizationId: manage.organizationId,
    }))
  ) {
    return { error: jsonError('Deploy as block is not enabled', 403), manage: null }
  }
  if (!manage.sourceWorkspaceId) {
    return { error: jsonError('Admin permissions required', 403), manage: null }
  }
  const error = await authorizeWorkspace(
    authenticationContext,
    manage.sourceWorkspaceId,
    'admin',
    dependencies
  )
  return error ? { error, manage: null } : { error: null, manage }
}

/**
 * Deep W5 module. Callers learn one `handle` interface while authentication,
 * tenant authorization, entitlement, feature rollout, persistence, visibility,
 * validation, audit ordering, and route observation remain local.
 */
export function createCustomBlockModule(
  dependencies: CustomBlockModuleDependencies
): CustomBlockModule {
  const nextId = dependencies.generateId ?? generateId
  const nextTypeSuffix =
    dependencies.generateTypeSuffix ?? (() => generateShortId(10).toLowerCase())

  return {
    async handle(request, context) {
      const url = new URL(request.url)
      const route = matchRoute(url.pathname)
      if (!route) return undefined

      if (request.method === 'OPTIONS') {
        return observed(
          new Response(null, {
            status: 204,
            headers: { Allow: route.allowHeader },
          }),
          route.inventoryId
        )
      }
      const effectiveMethod =
        request.method === 'HEAD' && route.allowed.includes('GET') ? 'GET' : request.method
      if (!route.allowed.includes(effectiveMethod)) {
        return observed(new Response(null, { status: 405 }), route.inventoryId)
      }

      const authentication = await authenticate(request, context.requestId, dependencies)
      if (!authentication.ok) {
        return observed(jsonError('Unauthorized', 401), route.inventoryId)
      }
      const actorId = authentication.context.actor.id

      try {
        let response: Response
        if (route.inventoryId === 'API-0045') {
          const parsed = listCustomBlocksQueryV1Schema.safeParse({
            workspaceId: queryValue(url, 'workspaceId'),
          })
          if (!parsed.success) response = validationError(parsed.error)
          else {
            const denied = await authorizeWorkspace(
              authentication,
              parsed.data.workspaceId,
              'read',
              dependencies
            )
            if (denied) response = denied
            else {
              const organizationId =
                (await dependencies.repository.findWorkspaceOrganization(
                  parsed.data.workspaceId
                )) ?? null
              const isPlatformAdmin = await dependencies.platformAdmins.isPlatformAdmin(actorId)
              response = Response.json(
                await dependencies.visibility.read({
                  userId: actorId,
                  organizationId,
                  isPlatformAdmin,
                })
              )
            }
          }
        } else if (route.inventoryId === 'API-0096' && effectiveMethod === 'GET') {
          const parsed = listCustomBlocksQueryV1Schema.safeParse({
            workspaceId: queryValue(url, 'workspaceId'),
          })
          if (!parsed.success) response = validationError(parsed.error)
          else {
            const denied = await authorizeWorkspace(
              authentication,
              parsed.data.workspaceId,
              'read',
              dependencies
            )
            if (denied) response = denied
            else {
              const organizationId = await dependencies.repository.findWorkspaceOrganization(
                parsed.data.workspaceId
              )
              if (!organizationId) response = Response.json({ enabled: false, customBlocks: [] })
              else {
                const featureEnabled = await dependencies.feature.isEnabled({
                  userId: actorId,
                  organizationId,
                })
                if (!featureEnabled) response = Response.json({ enabled: false, customBlocks: [] })
                else {
                  const enabled = await dependencies.entitlement.isEnterprise(organizationId)
                  response = Response.json({
                    enabled,
                    customBlocks: enabled
                      ? await dependencies.repository.listWithInputs(organizationId)
                      : [],
                  })
                }
              }
            }
          }
        } else if (route.inventoryId === 'API-0096') {
          const parsed = publishCustomBlockBodyV1Schema.safeParse(await parseJson(request))
          if (!parsed.success) response = validationError(parsed.error)
          else {
            const denied = await authorizeWorkspace(
              authentication,
              parsed.data.workspaceId,
              'admin',
              dependencies
            )
            if (denied) response = denied
            else {
              const organizationId = await dependencies.repository.findWorkspaceOrganization(
                parsed.data.workspaceId
              )
              if (!organizationId) {
                response = jsonError(
                  'Publishing a block requires the workspace to belong to an organization',
                  400
                )
              } else {
                if (
                  !(await dependencies.feature.isEnabled({
                    userId: actorId,
                    organizationId,
                  }))
                ) {
                  response = jsonError('Deploy as block is not enabled', 403)
                } else if (!(await dependencies.entitlement.isEnterprise(organizationId))) {
                  response = jsonError('Deploy as block requires an enterprise plan', 403)
                } else {
                  const block = await dependencies.repository.publish({
                    ...parsed.data,
                    id: nextId(),
                    type: `${customBlockTypePrefix}${nextTypeSuffix()}`,
                    organizationId,
                    userId: actorId,
                  })
                  dependencies.audit.published({
                    request,
                    actor: authentication.context.actor,
                    workspaceId: parsed.data.workspaceId,
                    organizationId,
                    resourceId: block.id,
                    resourceName: block.name,
                    type: block.type,
                    workflowId: block.workflowId,
                  })
                  response = Response.json({ customBlock: block })
                }
              }
            }
          }
        } else {
          let id: string
          try {
            id = decodeURIComponent(route.id ?? '')
          } catch {
            response = validationError({
              issues: [
                {
                  code: 'custom',
                  path: ['id'],
                  message: 'Invalid URL-encoded path parameter',
                },
              ],
            })
            return observed(response, route.inventoryId)
          }
          const parsedParams = customBlockIdParamsV1Schema.safeParse({ id })
          if (!parsedParams.success) response = validationError(parsedParams.error)
          else {
            const authorization = await authorizeManage(
              actorId,
              authentication,
              parsedParams.data.id,
              dependencies
            )
            if (authorization.error || !authorization.manage) response = authorization.error
            else if (route.inventoryId === 'API-0095') {
              response = Response.json(
                await dependencies.repository.countUsages(
                  authorization.manage.organizationId,
                  authorization.manage.type
                )
              )
            } else if (effectiveMethod === 'PATCH') {
              const patch = updateCustomBlockBodyV1Schema.safeParse(await parseJson(request))
              if (!patch.success) response = validationError(patch.error)
              else {
                const updated = await dependencies.repository.update(
                  parsedParams.data.id,
                  authorization.manage.organizationId,
                  patch.data
                )
                if (!updated) response = jsonError('Not found', 404)
                else {
                  dependencies.audit.updated({
                    request,
                    actor: authentication.context.actor,
                    workspaceId: authorization.manage.sourceWorkspaceId,
                    organizationId: authorization.manage.organizationId,
                    resourceId: parsedParams.data.id,
                    resourceName: patch.data.name ?? authorization.manage.name,
                    type: authorization.manage.type,
                  })
                  response = Response.json({ success: true })
                }
              }
            } else {
              const usage = await dependencies.repository.countUsages(
                authorization.manage.organizationId,
                authorization.manage.type
              )
              const deleted = await dependencies.repository.delete(
                parsedParams.data.id,
                authorization.manage.organizationId
              )
              if (!deleted) response = jsonError('Not found', 404)
              else {
                dependencies.audit.deleted({
                  request,
                  actor: authentication.context.actor,
                  workspaceId: authorization.manage.sourceWorkspaceId,
                  organizationId: authorization.manage.organizationId,
                  resourceId: parsedParams.data.id,
                  resourceName: authorization.manage.name,
                  type: authorization.manage.type,
                  usage,
                })
                response = Response.json({ success: true })
              }
            }
          }
        }
        return observed(
          request.method === 'HEAD'
            ? new Response(null, { status: response.status, headers: response.headers })
            : response,
          route.inventoryId
        )
      } catch (error) {
        if (error instanceof CustomBlockDomainError) {
          return observed(jsonError(error.message, 400), route.inventoryId)
        }
        logger.error('Custom block request failed', {
          error,
          inventoryId: route.inventoryId,
          requestId: context.requestId,
        })
        return observed(
          Response.json(
            { error: 'Internal server error', requestId: context.requestId },
            { status: 500 }
          ),
          route.inventoryId
        )
      }
    },
  }
}

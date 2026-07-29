import {
  environmentSaveResponseSchema,
  personalEnvironmentResponseSchema,
  savePersonalEnvironmentBodySchema,
} from '@sim/api-contracts/environment'
import type { ApiRequestContext } from '@/http/request-context'
import type { EnvironmentModuleDependencies } from './ports'

export interface EnvironmentModule {
  handle(request: Request, context: ApiRequestContext): Promise<Response | undefined>
}

function error(message: string, status: number, details?: unknown[]): Response {
  return Response.json(
    {
      error: message,
      ...(details ? { details } : {}),
    },
    { status }
  )
}

export function createEnvironmentModule(
  dependencies: EnvironmentModuleDependencies
): EnvironmentModule {
  return {
    async handle(request, context) {
      const { pathname } = new URL(request.url)
      if (pathname !== '/api/environment' || !['GET', 'POST'].includes(request.method)) {
        return undefined
      }

      const authentication = await dependencies.authentication.authenticate({
        request,
        requestId: context.requestId,
        policy: { mode: 'session' },
      })
      if (!authentication.ok) {
        return error(
          authentication.error.status === 503 ? 'Service unavailable' : 'Unauthorized',
          authentication.error.status
        )
      }
      const actor = {
        id: authentication.context.actor.id,
        name: authentication.context.actor.name ?? null,
        email: authentication.context.actor.email ?? null,
      }

      if (request.method === 'GET') {
        try {
          const encryptedVariables =
            (await dependencies.repository.getEncryptedVariables(actor.id)) ?? {}
          const entries = await Promise.all(
            Object.entries(encryptedVariables).map(async ([key, encryptedValue]) => {
              try {
                return [
                  key,
                  { key, value: await dependencies.cipher.decrypt(encryptedValue) },
                ] as const
              } catch {
                return [key, { key, value: '' }] as const
              }
            })
          )
          return Response.json(
            personalEnvironmentResponseSchema.parse({
              data: Object.fromEntries(entries),
            })
          )
        } catch (cause) {
          return error(cause instanceof Error ? cause.message : 'Environment fetch failed', 500)
        }
      }

      let body: unknown
      try {
        body = await request.json()
      } catch {
        return error('Invalid request data', 400)
      }
      const parsed = savePersonalEnvironmentBodySchema.safeParse(body)
      if (!parsed.success) {
        return error('Invalid request data', 400, parsed.error.issues)
      }

      try {
        const encryptedVariables = Object.fromEntries(
          await Promise.all(
            Object.entries(parsed.data.variables).map(async ([key, value]) => [
              key,
              await dependencies.cipher.encrypt(value),
            ])
          )
        )
        const keys = Object.keys(parsed.data.variables)
        await dependencies.repository.upsertEncryptedVariables(actor.id, encryptedVariables)
        await dependencies.credentials.synchronize(actor.id, keys)
        await dependencies.audit.updated({
          actor,
          authenticationContext: authentication.context,
          keys,
          request,
        })
        await dependencies.events.updated({ actorId: actor.id, keyCount: keys.length })
        return Response.json(environmentSaveResponseSchema.parse({ success: true }))
      } catch {
        return error('Failed to update environment variables', 500)
      }
    },
  }
}

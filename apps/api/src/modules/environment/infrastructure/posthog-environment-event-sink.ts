import { createLogger } from '@sim/logger'
import type { PostHog } from 'posthog-node'
import type { EnvironmentEventSink } from '@/modules/environment/application/ports'

const logger = createLogger('EnvironmentTelemetry')
let client: PostHog | null | undefined

async function getClient(): Promise<PostHog | null> {
  if (client !== undefined) return client
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim()
  const enabled = process.env.NEXT_PUBLIC_POSTHOG_ENABLED?.trim().toLowerCase()
  if (!key || enabled === 'false' || enabled === '0') {
    client = null
    return client
  }
  const { PostHog } = await import('posthog-node')
  client = new PostHog(key, {
    host: 'https://us.i.posthog.com',
    flushAt: 20,
    flushInterval: 10_000,
  })
  return client
}

export function createPostHogEnvironmentEventSink(): EnvironmentEventSink {
  return {
    updated({ actorId, keyCount }) {
      void getClient()
        .then((posthog) => {
          posthog?.capture({
            distinctId: actorId,
            event: 'environment_updated',
            properties: {
              key_count: keyCount,
              scope: 'personal',
            },
          })
        })
        .catch((error) => {
          logger.warn('Failed to capture environment_updated event', { error })
        })
    },
  }
}

export async function shutdownEnvironmentTelemetry(): Promise<void> {
  if (client) await client.shutdown()
  client = undefined
}

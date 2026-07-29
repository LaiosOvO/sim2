import {
  type AppConfigProfileReader,
  matchesAppConfigGateRule,
  parseAppConfigGateDocument,
} from '@sim/infra-appconfig'
import type { ForkingRuntimeConfig } from '@/config/forking-runtime'
import type { ForkRolloutReader } from '@/modules/workspace-forking'

const FEATURE_FLAGS_PROFILE = 'feature-flags'
const WORKSPACE_FORKING_FLAG = 'workspace-forking'

export interface PlatformAdminReader {
  isPlatformAdmin(userId: string): Promise<boolean>
}

export interface AppConfigForkRolloutDependencies {
  profiles: AppConfigProfileReader
  platformAdmins: PlatformAdminReader
  runtime: ForkingRuntimeConfig
}

export function createAppConfigForkRolloutReader(
  dependencies: AppConfigForkRolloutDependencies
): ForkRolloutReader {
  return {
    async isEnabled(context) {
      if (!dependencies.runtime.appConfig.enabled) {
        return dependencies.runtime.forkingEnabled
      }

      const rules = await dependencies.profiles.read(
        {
          application: dependencies.runtime.appConfig.application,
          environment: dependencies.runtime.appConfig.environment,
          profile: FEATURE_FLAGS_PROFILE,
        },
        parseAppConfigGateDocument
      )
      const rule =
        rules?.[WORKSPACE_FORKING_FLAG] ??
        (rules === null ? { enabled: dependencies.runtime.forkingEnabled } : undefined)

      if (
        matchesAppConfigGateRule(rule, {
          userId: context.userId,
          orgId: context.organizationId,
        })
      ) {
        return true
      }
      if (!rule?.adminEnabled) return false
      return dependencies.platformAdmins.isPlatformAdmin(context.userId)
    },
  }
}

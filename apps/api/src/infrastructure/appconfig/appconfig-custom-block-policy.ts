import {
  type AppConfigProfileReader,
  matchesAppConfigGateRule,
  parseAppConfigGateDocument,
} from '@sim/infra-appconfig'
import type {
  BlockVisibilityReader,
  CustomBlockFeatureGate,
} from '@/modules/custom-blocks/ports/custom-block-policy'

interface AppConfigIdentifiers {
  application: string
  environment: string
}

export interface AppConfigCustomBlockPolicyOptions {
  profiles: AppConfigProfileReader
  identifiers?: AppConfigIdentifiers
  deployAsBlockFallback: boolean
  previewBlocksFallback: readonly string[]
  platformAdmins?: { isPlatformAdmin(userId: string): Promise<boolean> }
}

const featureProfile = 'feature-flags'
const visibilityProfile = 'block-visibility'
const customBlockPrefix = 'custom_block_'

/**
 * Focused production feature/visibility adapter. It consumes only the generic
 * AppConfig reader and rule evaluator; neither the Sim env barrel nor block
 * registry is reachable from the standalone API.
 */
export function createAppConfigCustomBlockPolicy(options: AppConfigCustomBlockPolicyOptions): {
  feature: CustomBlockFeatureGate
  visibility: BlockVisibilityReader
} {
  return {
    feature: {
      async isEnabled(input) {
        if (!options.identifiers) return options.deployAsBlockFallback
        const rules = await options.profiles.read(
          { ...options.identifiers, profile: featureProfile },
          parseAppConfigGateDocument
        )
        if (!rules) return options.deployAsBlockFallback
        const rule = rules['deploy-as-block']
        if (
          matchesAppConfigGateRule(
            rule,
            { userId: input.userId, orgId: input.organizationId },
            false
          )
        ) {
          return true
        }
        const isPlatformAdmin =
          input.isPlatformAdmin ??
          (rule?.adminEnabled && options.platformAdmins
            ? await options.platformAdmins.isPlatformAdmin(input.userId)
            : false)
        return matchesAppConfigGateRule(
          rule,
          { userId: input.userId, orgId: input.organizationId },
          isPlatformAdmin
        )
      },
    },
    visibility: {
      async read(input) {
        if (!options.identifiers) {
          return {
            revealed: [...options.previewBlocksFallback],
            disabled: [],
            previewTagged: [...options.previewBlocksFallback],
          }
        }
        const rules =
          (await options.profiles.read(
            { ...options.identifiers, profile: visibilityProfile },
            parseAppConfigGateDocument
          )) ?? {}
        const revealed: string[] = []
        const disabled: string[] = []
        const previewTagged: string[] = []
        for (const [type, rule] of Object.entries(rules)) {
          if (type.startsWith(customBlockPrefix)) continue
          const visible = matchesAppConfigGateRule(
            rule,
            { userId: input.userId, orgId: input.organizationId },
            input.isPlatformAdmin
          )
          if (!visible) disabled.push(type)
          else {
            revealed.push(type)
            if (rule.enabled !== true) previewTagged.push(type)
          }
        }
        return { revealed, disabled, previewTagged }
      },
    },
  }
}

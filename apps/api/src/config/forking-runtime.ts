export interface ForkingRuntimeConfig {
  billingEnabled: boolean
  forkingEnabled: boolean
  accessControlEnabled: boolean
  hosted: boolean
  appConfig:
    | {
        enabled: true
        application: string
        environment: string
        region?: string
      }
    | {
        enabled: false
      }
}

function legacyTruthy(value: string | undefined): boolean {
  return value?.toLowerCase() === 'true' || value === '1'
}

function optionalBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined || value === '') return undefined
  return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function hostedApplication(value: string | undefined): boolean {
  if (!value) return false
  try {
    const hostname = new URL(value).hostname
    return hostname === 'sim.ai' || hostname.endsWith('.sim.ai')
  } catch {
    return false
  }
}

export function readForkingRuntimeConfig(
  environment: NodeJS.ProcessEnv = process.env
): ForkingRuntimeConfig {
  const billingEnabled = legacyTruthy(environment.BILLING_ENABLED)
  const explicit = optionalBoolean(environment.FORKING_ENABLED)
  const hosted = hostedApplication(environment.NEXT_PUBLIC_APP_URL)
  const application = environment.APPCONFIG_APPLICATION?.trim()
  const appConfigEnvironment = environment.APPCONFIG_ENVIRONMENT?.trim()
  const appConfig =
    hosted && application && appConfigEnvironment
      ? {
          enabled: true as const,
          application,
          environment: appConfigEnvironment,
          ...(environment.AWS_REGION?.trim() ? { region: environment.AWS_REGION.trim() } : {}),
        }
      : { enabled: false as const }

  return {
    billingEnabled,
    forkingEnabled: billingEnabled
      ? (explicit ?? false)
      : (explicit ?? legacyTruthy(environment.ENTERPRISE_ENABLED)),
    accessControlEnabled: optionalBoolean(environment.ACCESS_CONTROL_ENABLED) ?? false,
    hosted,
    appConfig,
  }
}

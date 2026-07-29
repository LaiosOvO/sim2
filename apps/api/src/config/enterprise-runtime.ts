export interface AccessControlRuntimeConfig {
  billingEnabled: boolean
  accessControlEnabled: boolean
  hosted: boolean
}

function legacyTruthy(value: string | undefined): boolean {
  return value?.toLowerCase() === 'true' || value === '1'
}

function configuredBoolean(value: string | undefined): boolean {
  if (!value) return false
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

export function readAccessControlRuntimeConfig(
  environment: NodeJS.ProcessEnv = process.env
): AccessControlRuntimeConfig {
  return {
    billingEnabled: legacyTruthy(environment.BILLING_ENABLED),
    accessControlEnabled: configuredBoolean(environment.ACCESS_CONTROL_ENABLED),
    hosted: hostedApplication(environment.NEXT_PUBLIC_APP_URL),
  }
}

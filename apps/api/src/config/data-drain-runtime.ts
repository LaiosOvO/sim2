export interface DataDrainRuntimeConfig {
  billingEnabled: boolean
  dataDrainsEnabled: boolean
  accessControlEnabled: boolean
  hosted: boolean
}

function truthy(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true' || value === '1'
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

export function readDataDrainRuntimeConfig(
  environment: NodeJS.ProcessEnv = process.env
): DataDrainRuntimeConfig {
  const billingEnabled = truthy(environment.BILLING_ENABLED)
  const explicit = optionalBoolean(environment.DATA_DRAINS_ENABLED)
  const enterpriseEnabled = truthy(environment.ENTERPRISE_ENABLED)
  return {
    billingEnabled,
    dataDrainsEnabled: billingEnabled ? (explicit ?? false) : (explicit ?? enterpriseEnabled),
    accessControlEnabled: optionalBoolean(environment.ACCESS_CONTROL_ENABLED) ?? false,
    hosted: hostedApplication(environment.NEXT_PUBLIC_APP_URL),
  }
}

#!/usr/bin/env bun
import { baseProviderModelCatalog } from '../../apps/api/src/infrastructure/generated/base-provider-model-catalog.generated'

async function main(): Promise<void> {
  process.env.BLACKLISTED_MODELS = ''
  process.env.BLACKLISTED_PROVIDERS = ''

  const { getBaseModelProviders } = await import('../../apps/sim/providers/utils')
  const donor = getBaseModelProviders()
  const generatedOwners = new Map<string, string>()
  for (const entry of baseProviderModelCatalog) {
    generatedOwners.set(entry.id.toLowerCase(), entry.provider.toLowerCase())
  }

  const donorModels = Object.keys(donor)
  const generatedModels = [...generatedOwners.keys()]
  const failures: string[] = []
  const firstOrderMismatch = donorModels.findIndex(
    (model, index) => model !== generatedModels[index]
  )
  if (firstOrderMismatch >= 0 || donorModels.length !== generatedModels.length) {
    failures.push(
      `ordered wire mismatch at ${firstOrderMismatch}: donor=${donorModels[firstOrderMismatch] ?? '<end>'}, generated=${generatedModels[firstOrderMismatch] ?? '<end>'}`
    )
  }

  for (const [model, provider] of Object.entries(donor)) {
    const generatedProvider = generatedOwners.get(model)
    if (generatedProvider !== provider) {
      failures.push(
        `${model}: donor owner ${provider}, generated owner ${generatedProvider ?? '<missing>'}`
      )
    }
  }

  if (failures.length > 0) {
    console.error('Base provider model catalog parity violations:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }

  console.log(
    `Base provider model catalog parity OK: ${donorModels.length} ordered models with last-provider-wins ownership`
  )
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(1)
})

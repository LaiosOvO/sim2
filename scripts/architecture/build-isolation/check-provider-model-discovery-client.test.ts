import { describe, expect, it } from 'vitest'
import { providerModelClientSourceFailures } from './check-provider-model-discovery-client'

const focusedHook = `
import { getBaseProviderModelsContract } from '@/lib/api/contracts/provider-model-discovery'
`

const focusedLoader = `
import { useSearchModalOpenStore } from '@/stores/modals/search/open-state'
const isWorkflowEditor = true
const shouldLoadDynamicModels = true
const integrations = '/integrations'
const customBlocks = '/settings/custom-blocks'
`

describe('provider model discovery client source boundary', () => {
  it('rejects a heavyweight provider utility import in the final loader', () => {
    expect(
      providerModelClientSourceFailures(
        focusedHook,
        `${focusedLoader}\nimport { providers } from '@/providers/utils'`
      )
    ).toContain('real provider loader imports the heavyweight provider utility module')
  })

  it('accepts the focused contract and lightweight loader seam', () => {
    expect(providerModelClientSourceFailures(focusedHook, focusedLoader)).toEqual([])
  })
})

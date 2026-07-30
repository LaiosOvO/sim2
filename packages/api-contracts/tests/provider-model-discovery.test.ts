import { describe, expect, it } from 'vitest'
import {
  getBasetenProviderModelsContractV1,
  getOpenRouterProviderModelsContractV1,
  providerModelDiscoveryQueryV1Schema,
  providerModelDiscoveryRoutesV1,
  providerModelsResponseV1Schema,
} from '../src/provider-model-discovery'

describe('provider model discovery V1 contracts', () => {
  it('freezes all nine inventory routes and focused GET contracts', () => {
    expect(
      providerModelDiscoveryRoutesV1.map(({ inventoryId, path, provider }) => ({
        inventoryId,
        path,
        provider,
      }))
    ).toEqual([
      { inventoryId: 'API-0270', path: '/api/providers/base/models', provider: 'base' },
      {
        inventoryId: 'API-0271',
        path: '/api/providers/baseten/models',
        provider: 'baseten',
      },
      {
        inventoryId: 'API-0272',
        path: '/api/providers/fireworks/models',
        provider: 'fireworks',
      },
      {
        inventoryId: 'API-0273',
        path: '/api/providers/litellm/models',
        provider: 'litellm',
      },
      {
        inventoryId: 'API-0274',
        path: '/api/providers/ollama-cloud/models',
        provider: 'ollama-cloud',
      },
      {
        inventoryId: 'API-0275',
        path: '/api/providers/ollama/models',
        provider: 'ollama',
      },
      {
        inventoryId: 'API-0276',
        path: '/api/providers/openrouter/models',
        provider: 'openrouter',
      },
      {
        inventoryId: 'API-0278',
        path: '/api/providers/together/models',
        provider: 'together',
      },
      { inventoryId: 'API-0279', path: '/api/providers/vllm/models', provider: 'vllm' },
    ])
    expect(getBasetenProviderModelsContractV1.method).toBe('GET')
    expect(getOpenRouterProviderModelsContractV1.response.mode).toBe('json')
  })

  it('preserves optional non-empty workspace query semantics', () => {
    expect(providerModelDiscoveryQueryV1Schema.parse({})).toEqual({})
    expect(providerModelDiscoveryQueryV1Schema.parse({ workspaceId: 'workspace-1' })).toEqual({
      workspaceId: 'workspace-1',
    })
    expect(() => providerModelDiscoveryQueryV1Schema.parse({ workspaceId: '' })).toThrow()
  })

  it('strips unknown model and secret-bearing response fields', () => {
    const parsed = providerModelsResponseV1Schema.parse({
      models: ['openrouter/model-a'],
      modelInfo: {
        'openrouter/model-a': {
          id: 'openrouter/model-a',
          contextLength: 128_000,
          supportsStructuredOutputs: true,
          supportsTools: true,
          pricing: { input: 1, output: 2, upstreamSecret: 'must-not-leak' },
          authorization: 'must-not-leak',
        },
      },
      apiKey: 'must-not-leak',
    })

    expect(parsed).toEqual({
      models: ['openrouter/model-a'],
      modelInfo: {
        'openrouter/model-a': {
          id: 'openrouter/model-a',
          contextLength: 128_000,
          supportsStructuredOutputs: true,
          supportsTools: true,
          pricing: { input: 1, output: 2 },
        },
      },
    })
    expect(JSON.stringify(parsed)).not.toContain('must-not-leak')
  })
})

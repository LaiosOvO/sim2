import { describe, expect, it } from 'vitest'
import {
  extractEntries,
  extractProviderOrder,
  orderEntries,
} from './generate-base-provider-model-catalog'

describe('base provider model catalog generation', () => {
  it('uses the donor provider iteration order instead of definition-file order', () => {
    const entries = extractEntries(
      `
export const PROVIDER_DEFINITIONS = {
  azure: {
    models: [
      {
        id: 'azure-a',
      },
    ],
  },
  google: {
    models: [
      {
        id: 'gemini-a',
      },
    ],
  },
}
`,
      2
    )
    const providerOrder = extractProviderOrder(`
export const providers: Record<string, unknown> = {
  google: buildProviderMetadata('google'),
  azure: buildProviderMetadata('azure'),
  openai: buildProviderMetadata('openai'),
  anthropic: buildProviderMetadata('anthropic'),
  vertex: buildProviderMetadata('vertex'),
  deepseek: buildProviderMetadata('deepseek'),
  xai: buildProviderMetadata('xai'),
  cerebras: buildProviderMetadata('cerebras'),
  groq: buildProviderMetadata('groq'),
  sakana: buildProviderMetadata('sakana'),
  nvidia: buildProviderMetadata('nvidia'),
  meta: buildProviderMetadata('meta'),
  zai: buildProviderMetadata('zai'),
  kimi: buildProviderMetadata('kimi'),
  mistral: buildProviderMetadata('mistral'),
  bedrock: buildProviderMetadata('bedrock'),
  ollama: buildProviderMetadata('ollama'),
  vllm: buildProviderMetadata('vllm'),
  litellm: buildProviderMetadata('litellm'),
  openrouter: buildProviderMetadata('openrouter'),
}
`)

    expect(orderEntries(entries, providerOrder)).toEqual([
      { id: 'gemini-a', provider: 'google' },
      { id: 'azure-a', provider: 'azure' },
    ])
  })
})

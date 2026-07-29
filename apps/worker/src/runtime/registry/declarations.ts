import type { RuntimeToolDeclaration } from './types'

/**
 * Worker-owned runtime declarations. Catalog consistency is checked at
 * generation time; runtime code never imports generated browser metadata.
 */
export const RUNTIME_TOOL_DECLARATIONS = [
  {
    providerId: 'notion',
    toolId: 'notion_add_database_row_v2',
    aliases: ['notion_add_database_row'],
  },
] as const satisfies readonly RuntimeToolDeclaration[]

export type RuntimeProviderId = (typeof RUNTIME_TOOL_DECLARATIONS)[number]['providerId']

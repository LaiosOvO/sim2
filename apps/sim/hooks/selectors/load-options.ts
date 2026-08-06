import type { SelectorDefinition, SelectorOption, SelectorQueryArgs } from '@/hooks/selectors/types'

const MAX_LOAD_ALL_PAGES = 50

export async function loadAllSelectorOptions(
  definition: SelectorDefinition,
  args: SelectorQueryArgs
): Promise<SelectorOption[]> {
  if (definition.fetchList) return definition.fetchList(args)

  if (definition.fetchPage) {
    const items: SelectorOption[] = []
    let cursor: string | undefined
    for (let page = 0; page < MAX_LOAD_ALL_PAGES; page++) {
      const { items: pageItems, nextCursor } = await definition.fetchPage({ ...args, cursor })
      items.push(...pageItems)
      cursor = nextCursor
      if (!cursor) break
    }
    return items
  }

  return []
}

export function mergeOption(options: SelectorOption[], option?: SelectorOption | null) {
  if (!option || options.some((item) => item.id === option.id)) return options
  return [option, ...options]
}

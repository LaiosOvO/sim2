import type { ToolCatalogSummaryDocumentV1, ToolCatalogSummaryItemV1 } from './index'

export interface CatalogSearch {
  query?: string
  provider?: string
  cursor?: string
  limit?: number
}

export interface CatalogSearchResult {
  items: readonly ToolCatalogSummaryItemV1[]
  nextCursor: string | null
}

export interface CatalogSummaryReader {
  get(id: string): ToolCatalogSummaryItemV1 | undefined
  all(): readonly ToolCatalogSummaryItemV1[]
  search(request?: CatalogSearch): CatalogSearchResult
}

export function createCatalogSummaryReader(
  document: ToolCatalogSummaryDocumentV1
): CatalogSummaryReader {
  const byId = new Map<string, ToolCatalogSummaryItemV1>()
  for (const item of document.items) {
    byId.set(item.id, item)
    for (const alias of item.legacyIds) byId.set(alias, item)
  }

  return {
    get(id) {
      return byId.get(id) ?? byId.get(id.replaceAll('-', '_'))
    },
    all() {
      return document.items
    },
    search(request = {}) {
      const query = request.query?.trim().toLocaleLowerCase() ?? ''
      const offset = request.cursor ? Number.parseInt(request.cursor, 10) : 0
      const limit = Math.max(1, Math.min(request.limit ?? 50, 200))
      const matches = document.items.filter((item) => {
        if (request.provider && item.provider !== request.provider) return false
        if (!query) return true
        return [item.id, item.display.name, item.display.description, item.display.category].some(
          (field) => field.toLocaleLowerCase().includes(query)
        )
      })
      const items = matches.slice(offset, offset + limit)
      const nextOffset = offset + items.length
      return {
        items,
        nextCursor: nextOffset < matches.length ? String(nextOffset) : null,
      }
    },
  }
}

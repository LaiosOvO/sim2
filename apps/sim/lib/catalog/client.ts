import type { ToolCatalogSummaryDocumentV1 } from '@sim/tool-catalog'
import { createCatalogSummaryReader } from '@sim/tool-catalog/browser'
import catalogDocument from '@sim/tool-catalog/generated/browser-summary'

const catalog = createCatalogSummaryReader(
  catalogDocument as unknown as ToolCatalogSummaryDocumentV1
)

export const getCatalogSummaryItem = catalog.get
export const getAllCatalogSummaryItems = catalog.all
export const searchCatalogSummary = catalog.search

export interface BaseProviderModel {
  readonly id: string
  readonly provider: string
}

export interface BaseProviderModelCatalog {
  list(): Promise<readonly BaseProviderModel[]> | readonly BaseProviderModel[]
}

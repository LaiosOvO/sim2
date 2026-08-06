declare const document: {
  catalogVersion: 1
  catalogHash: string
  items: Array<{
    type: string
    title: string
    capabilities: string[]
  }>
}

export default document

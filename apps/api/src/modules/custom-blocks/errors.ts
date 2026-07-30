export class CustomBlockDomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CustomBlockDomainError'
  }
}

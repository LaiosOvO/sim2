export type WorkspaceCredentialProvider = 'baseten' | 'fireworks' | 'ollama-cloud' | 'together'

export interface ProviderModelCredentialReader {
  readAuthorized(input: {
    readonly actorId: string
    readonly provider: WorkspaceCredentialProvider
    readonly workspaceId: string
  }): Promise<string | null>
}

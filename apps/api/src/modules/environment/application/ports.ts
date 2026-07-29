import type { AuthenticatedRequestContext } from '@sim/api-contracts/auth'
import type { RequestAuthenticator } from '@sim/auth/request-context'

export interface EnvironmentActor {
  id: string
  name: string | null
  email: string | null
}

export interface EnvironmentRepository {
  getEncryptedVariables(userId: string): Promise<Record<string, string> | undefined>
  upsertEncryptedVariables(userId: string, variables: Record<string, string>): Promise<void>
}

export interface EnvironmentSecretCipher {
  encrypt(value: string): Promise<string>
  decrypt(value: string): Promise<string>
}

export interface PersonalEnvironmentCredentialSync {
  synchronize(userId: string, keys: readonly string[]): Promise<void>
}

export interface EnvironmentAuditSink {
  updated(input: {
    actor: EnvironmentActor
    authenticationContext: AuthenticatedRequestContext
    keys: readonly string[]
    request: Request
  }): Promise<void> | void
}

export interface EnvironmentEventSink {
  updated(input: { actorId: string; keyCount: number }): Promise<void> | void
}

export interface EnvironmentModuleDependencies {
  authentication: RequestAuthenticator
  repository: EnvironmentRepository
  cipher: EnvironmentSecretCipher
  credentials: PersonalEnvironmentCredentialSync
  audit: EnvironmentAuditSink
  events: EnvironmentEventSink
}

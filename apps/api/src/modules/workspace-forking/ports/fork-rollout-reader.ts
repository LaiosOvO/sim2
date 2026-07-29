export interface ForkRolloutContext {
  userId: string
  organizationId: string | null
}

export interface ForkRolloutReader {
  isEnabled(context: ForkRolloutContext): Promise<boolean>
}

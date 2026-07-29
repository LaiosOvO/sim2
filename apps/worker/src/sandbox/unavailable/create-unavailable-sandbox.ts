import type { SandboxExecution } from '@/sandbox/interface/types'
import { SandboxExecutionFailure } from '@/sandbox/interface/types'

export function createUnavailableSandbox(reason: string): SandboxExecution {
  return {
    async health() {
      return false
    },
    async execute() {
      throw new SandboxExecutionFailure('SANDBOX_POLICY_REJECTED', reason, false)
    },
  }
}

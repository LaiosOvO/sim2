import { EXECUTION_CONTRACTS_VERSION } from '@sim/execution-contracts'
import { sandboxExecutionResultV1Schema } from '@sim/execution-contracts/job-control'
import {
  type SandboxAuditSink,
  type SandboxExecution,
  SandboxExecutionFailure,
} from '@/sandbox/interface/types'

const noOpAudit: SandboxAuditSink = {
  record() {},
}

function encodedSize(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value) ?? 'null')
  } catch {
    throw new SandboxExecutionFailure(
      'SANDBOX_POLICY_REJECTED',
      'Sandbox input must be JSON serializable',
      false
    )
  }
}

async function wait(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new SandboxExecutionFailure('SANDBOX_CANCELLED', 'Sandbox execution cancelled', false)
  }
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', abort)
    const timer = setTimeout(() => {
      cleanup()
      resolve()
    }, delayMs)
    const abort = () => {
      clearTimeout(timer)
      cleanup()
      reject(
        signal.reason instanceof Error
          ? signal.reason
          : new SandboxExecutionFailure('SANDBOX_CANCELLED', 'Sandbox execution cancelled', false)
      )
    }
    signal.addEventListener('abort', abort, { once: true })
    timer.unref?.()
  })
}

/**
 * A deterministic adapter for proving the SandboxExecution boundary. It never
 * evaluates source code and never exposes network, filesystem or secret values.
 */
export function createRestrictedTestSandbox(audit: SandboxAuditSink = noOpAudit): SandboxExecution {
  return {
    async health() {
      return true
    },
    async execute(request) {
      const { payload } = request
      if (
        payload.policy.network !== 'deny' ||
        payload.policy.filesystem.mode !== 'ephemeral' ||
        payload.policy.secrets.mode !== 'references-only'
      ) {
        throw new SandboxExecutionFailure(
          'SANDBOX_POLICY_REJECTED',
          'Restricted Sandbox policy rejected',
          false
        )
      }
      const inputBytes = encodedSize(payload.input)
      if (inputBytes > payload.policy.maxInputBytes) {
        throw new SandboxExecutionFailure(
          'SANDBOX_INPUT_TOO_LARGE',
          `Sandbox input is ${inputBytes} bytes; limit is ${payload.policy.maxInputBytes}`,
          false
        )
      }

      const startedAt = performance.now()
      await audit.record({
        executionId: request.executionId,
        attempt: request.attempt,
        phase: 'started',
        operation: payload.operation,
        policy: payload.policy,
      })

      try {
        if (payload.delayMs > 0) await wait(payload.delayMs, request.signal)
        if (
          payload.operation === 'transient-failure' &&
          request.attempt <= payload.failuresBeforeSuccess
        ) {
          throw new SandboxExecutionFailure(
            'SANDBOX_TRANSIENT_FAILURE',
            `Synthetic transient failure on attempt ${request.attempt}`,
            true
          )
        }
        if (payload.operation === 'fatal-failure') {
          throw new SandboxExecutionFailure(
            'SANDBOX_FATAL_FAILURE',
            'Synthetic fatal Sandbox failure',
            false
          )
        }

        const result = sandboxExecutionResultV1Schema.parse({
          contractVersion: EXECUTION_CONTRACTS_VERSION,
          executionId: request.executionId,
          output: payload.input ?? null,
          usage: {
            wallClockMs: Math.max(0, Math.round(performance.now() - startedAt)),
            inputBytes,
          },
        })
        await audit.record({
          executionId: request.executionId,
          attempt: request.attempt,
          phase: 'completed',
          operation: payload.operation,
          policy: payload.policy,
        })
        return result
      } catch (error) {
        const failure =
          error instanceof SandboxExecutionFailure
            ? error
            : new SandboxExecutionFailure(
                'SANDBOX_FATAL_FAILURE',
                error instanceof Error ? error.message : 'Sandbox execution failed',
                false
              )
        await audit.record({
          executionId: request.executionId,
          attempt: request.attempt,
          phase: 'failed',
          operation: payload.operation,
          policy: payload.policy,
          errorCode: failure.code,
        })
        throw failure
      }
    },
  }
}

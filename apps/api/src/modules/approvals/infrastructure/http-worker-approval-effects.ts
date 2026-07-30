import { EXECUTION_CONTRACTS_VERSION } from '@sim/execution-contracts'
import {
  approvalEffectCommandV1Schema,
  approvalEffectResultV1Schema,
} from '@sim/execution-contracts/approval-effects'
import type { ApprovalEffectsPort } from '@/modules/approvals/ports'

export interface HttpWorkerApprovalEffectsOptions {
  baseUrl: string
  internalToken: string
  fetcher?: typeof fetch
  timeoutMs?: number
}

export function createHttpWorkerApprovalEffects(
  options: HttpWorkerApprovalEffectsOptions
): ApprovalEffectsPort {
  const fetcher = options.fetcher ?? fetch
  async function send(event: string, idempotencyKey: string, body: unknown): Promise<void> {
    const payload =
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {}
    const command = approvalEffectCommandV1Schema.parse({
      contractVersion: EXECUTION_CONTRACTS_VERSION,
      commandId: idempotencyKey,
      idempotencyKey,
      event,
      ...payload,
    })
    const response = await fetcher(new URL('/internal/approvals/effects', options.baseUrl), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${options.internalToken}`,
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
        'x-approval-event': event,
      },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
    })
    if (!response.ok) {
      throw new Error(`Worker approval effects failed with ${response.status}`)
    }
    approvalEffectResultV1Schema.parse(await response.json())
  }
  return {
    approvalStarted(approval) {
      return send('approval.started', `${approval.id}:started`, {
        approvalId: approval.id,
        workspaceId: approval.workspaceId,
        taskIds: approval.tasks.map((task) => task.id),
      })
    },
    approvalDecided(input) {
      return send('approval.decided', `${input.approvalId}:${input.action}:${input.actorId}`, input)
    },
  }
}

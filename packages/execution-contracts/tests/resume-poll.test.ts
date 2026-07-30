import { EXECUTION_CONTRACTS_VERSION } from '@sim/execution-contracts'
import {
  resumePollCommandV1Schema,
  resumePollResultV1Schema,
} from '@sim/execution-contracts/resume-poll'
import { describe, expect, it } from 'vitest'

describe('resume-poll contract', () => {
  it('pins both command and result to the execution contract version', () => {
    const command = resumePollCommandV1Schema.parse({
      contractVersion: EXECUTION_CONTRACTS_VERSION,
      commandId: 'poll-1',
      requestedAt: '2026-07-30T00:00:00.000Z',
    })
    expect(
      resumePollResultV1Schema.parse({
        contractVersion: command.contractVersion,
        commandId: command.commandId,
        status: 'completed',
        claimedRows: 1,
        dispatched: 1,
        failures: [],
      }).commandId
    ).toBe('poll-1')
  })
})

/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { toolCallPresentation } from './tool-call-list'

describe('toolCallPresentation', () => {
  it('uses browser-safe Catalog metadata for integration capabilities', () => {
    expect(
      toolCallPresentation({
        id: 'tool-1',
        name: 'slack_message',
        status: 'running',
      })
    ).toMatchObject({ kind: 'integration', kindLabel: 'Slack', title: 'Message' })
  })

  it('resolves the delegated call_integration_tool capability', () => {
    expect(
      toolCallPresentation({
        id: 'tool-2',
        name: 'call_integration_tool',
        status: 'success',
        arguments: { toolId: 'gmail_send_v2' },
      })
    ).toMatchObject({ kind: 'integration', kindLabel: 'Gmail', title: 'Send' })
  })

  it('keeps explicit stream titles authoritative', () => {
    expect(
      toolCallPresentation({
        id: 'tool-3',
        name: 'terminal',
        status: 'running',
        title: 'Running bun test',
      })
    ).toMatchObject({ kind: 'terminal', kindLabel: 'Terminal', title: 'Running bun test' })
  })
})

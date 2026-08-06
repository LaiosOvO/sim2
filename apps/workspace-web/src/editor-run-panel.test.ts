/**
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest'
import { takeSseEvents } from './editor-run-panel'

describe('workspace Vite execution stream', () => {
  it('extracts complete SSE events and keeps an incomplete frame', () => {
    const parsed = takeSseEvents(
      'id: 1\r\ndata: {"type":"block:started","data":{"blockId":"one"}}\r\n\r\ndata: {"type":"execution:comp'
    )
    expect(parsed.events).toEqual([{ type: 'block:started', data: { blockId: 'one' } }])
    expect(parsed.rest).toBe('data: {"type":"execution:comp')
  })

  it('ignores malformed event payloads without discarding later events', () => {
    const parsed = takeSseEvents(
      'data: not-json\n\ndata: {"type":"execution:completed","data":{"success":true}}\n\n'
    )
    expect(parsed.events).toEqual([{ type: 'execution:completed', data: { success: true } }])
    expect(parsed.rest).toBe('')
  })
})

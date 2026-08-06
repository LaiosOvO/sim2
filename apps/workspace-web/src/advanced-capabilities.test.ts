/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { legacyHomeHref } from './runtime-links'

describe('complete Home compatibility link', () => {
  it('bypasses the Vite redirect and preserves the active chat', () => {
    expect(legacyHomeHref('http://127.0.0.1:3000', 'workspace/one', 'chat-1')).toBe(
      'http://127.0.0.1:3000/workspace/workspace%2Fone/home?runtime=next&chatId=chat-1'
    )
  })
})

import { describe, expect, it } from 'vitest'
import { generatePassword } from '@/lib/browser/password'

describe('generatePassword', () => {
  it('uses the default and requested lengths', () => {
    expect(generatePassword()).toHaveLength(24)
    expect(generatePassword(32)).toHaveLength(32)
    expect(generatePassword(1)).toHaveLength(1)
    expect(generatePassword(0)).toBe('')
  })

  it('uses only the supported password alphabet', () => {
    const allowed = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_-+='
    for (const character of generatePassword(1000)) {
      expect(allowed).toContain(character)
    }
  })

  it('does not repeat a deterministic value', () => {
    const passwords = new Set(Array.from({ length: 100 }, () => generatePassword()))
    expect(passwords.size).toBeGreaterThan(90)
  })
})

import { describe, expect, it } from 'vitest'
import { isValidEnvVarName } from '@/lib/browser/environment-variable'

describe('isValidEnvVarName', () => {
  it.each(['A', '_A', 'API_KEY', 'key123'])('accepts %s', (name) => {
    expect(isValidEnvVarName(name)).toBe(true)
  })

  it.each(['', '1KEY', 'API-KEY', 'API KEY', '密钥'])('rejects %s', (name) => {
    expect(isValidEnvVarName(name)).toBe(false)
  })
})

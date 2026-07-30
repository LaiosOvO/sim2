import { randomInt } from '@sim/utils/random'

const PASSWORD_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_-+='

/**
 * Generates a cryptographically secure password without importing server-side
 * encryption configuration or key material into the browser graph.
 */
export function generatePassword(length = 24): string {
  let result = ''
  for (let index = 0; index < length; index += 1) {
    result += PASSWORD_ALPHABET.charAt(randomInt(0, PASSWORD_ALPHABET.length))
  }
  return result
}

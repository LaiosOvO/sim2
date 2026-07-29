import { decrypt, encrypt } from '@sim/security/encryption'
import type { EnvironmentSecretCipher } from '@/modules/environment/application/ports'

export function createAesEnvironmentSecretCipher(hexKey: string): EnvironmentSecretCipher {
  if (!/^[0-9a-f]{64}$/i.test(hexKey)) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string')
  }
  const key = Buffer.from(hexKey, 'hex')
  return {
    async encrypt(value) {
      return (await encrypt(value, key)).encrypted
    },
    async decrypt(value) {
      return (await decrypt(value, key)).decrypted
    },
  }
}

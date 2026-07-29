import { SignJWT } from 'jose'
import { describe, expect, it } from 'vitest'
import { createInternalTokenVerifier } from '../src/internal-token'

const secret = 'internal-secret-at-least-32-characters'

async function token(input: {
  expiresIn: string
  audience?: string
  type?: string
}): Promise<string> {
  return new SignJWT({
    type: input.type ?? 'internal',
    userId: 'user-1',
    service: 'executor',
    scopes: ['workflow:*'],
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(input.expiresIn)
    .setIssuer('sim-internal')
    .setAudience(input.audience ?? 'sim-api')
    .sign(new TextEncoder().encode(secret))
}

describe('internal token verifier', () => {
  it('accepts legacy-compatible issuer and audience claims', async () => {
    const verifier = createInternalTokenVerifier({ secret })
    await expect(verifier.verify(await token({ expiresIn: '5m' }))).resolves.toEqual({
      verified: true,
      credential: {
        actor: { id: 'user-1', type: 'user' },
        service: 'executor',
        scopes: ['workflow:*'],
      },
    })
  })

  it('rejects expired, wrong-audience and wrong-type tokens', async () => {
    const verifier = createInternalTokenVerifier({ secret })
    for (const candidate of [
      await token({ expiresIn: '-1s' }),
      await token({ expiresIn: '5m', audience: 'other-api' }),
      await token({ expiresIn: '5m', type: 'external' }),
    ]) {
      await expect(verifier.verify(candidate)).resolves.toEqual({
        verified: false,
        reason: 'invalid',
      })
    }
  })
})

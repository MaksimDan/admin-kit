import { describe, it, expect } from 'vitest'
import { authenticator } from 'otplib'
import { createAdminAuth } from './auth'

const secret = authenticator.generateSecret()
const { authOptions } = createAdminAuth({
  adminEmail: 'admin@test.local',
  adminPassword: 'correct-horse',
  totpSecret: secret,
  nextAuthSecret: 'test-secret',
})

/* eslint-disable @typescript-eslint/no-explicit-any */
const jwtCb = authOptions.callbacks!.jwt as any
const sessionCb = authOptions.callbacks!.session as any
const providerCfg = authOptions.providers[0] as any
const authorize = (providerCfg.options?.authorize ?? providerCfg.authorize) as (c: any, r: any) => Promise<any>

describe('createAdminAuth — config', () => {
  it('throws without a nextAuthSecret', () => {
    expect(() => createAdminAuth({ adminEmail: 'a', adminPassword: 'b', totpSecret: 's', nextAuthSecret: '' })).toThrow()
  })
  it('throws without admin credentials', () => {
    expect(() => createAdminAuth({ adminEmail: '', adminPassword: '', totpSecret: 's', nextAuthSecret: 'x' })).toThrow()
  })
})

describe('jwt callback — absolute deadline stamped once at login', () => {
  it('stamps role + a future expiresAt when a user is present', async () => {
    const out = await jwtCb({ token: {}, user: { role: 'admin' } })
    expect(out.role).toBe('admin')
    expect(typeof out.expiresAt).toBe('number')
    expect(out.expiresAt).toBeGreaterThan(Date.now())
  })
  it('does NOT refresh expiresAt on later calls (window cannot slide)', async () => {
    const fixed = Date.now() + 5000
    const out = await jwtCb({ token: { role: 'admin', expiresAt: fixed }, user: undefined })
    expect(out.expiresAt).toBe(fixed)
  })
})

describe('session callback — absolute expiry', () => {
  it('exposes expiresAt + role before the deadline', async () => {
    const future = Date.now() + 60_000
    const out = await sessionCb({ session: { user: {} }, token: { role: 'admin', expiresAt: future } })
    expect(out.expiresAt).toBe(future)
    expect(out.user.role).toBe('admin')
  })
  it('strips the admin role past the deadline', async () => {
    const out = await sessionCb({ session: { user: { role: 'admin' } }, token: { role: 'admin', expiresAt: Date.now() - 1 } })
    expect(out.user.role).not.toBe('admin')
  })
  it('fails closed when the token has no deadline', async () => {
    const out = await sessionCb({ session: { user: { role: 'admin' } }, token: { role: 'admin' } })
    expect(out.user.role).not.toBe('admin')
  })
})

describe('authorize — email + password + valid TOTP', () => {
  const req = (ip: string) => ({ headers: { 'x-forwarded-for': ip } })
  it('returns the admin user when all three factors are correct', async () => {
    const user = await authorize({ email: 'admin@test.local', password: 'correct-horse', totp: authenticator.generate(secret) }, req('203.0.113.30'))
    expect(user).toMatchObject({ role: 'admin', email: 'admin@test.local' })
  })
  it('null on wrong password', async () => {
    const user = await authorize({ email: 'admin@test.local', password: 'nope', totp: authenticator.generate(secret) }, req('203.0.113.31'))
    expect(user).toBeNull()
  })
  it('null on bad TOTP', async () => {
    const user = await authorize({ email: 'admin@test.local', password: 'correct-horse', totp: '000000' }, req('203.0.113.32'))
    expect(user).toBeNull()
  })
  it('null when TOTP missing', async () => {
    const user = await authorize({ email: 'admin@test.local', password: 'correct-horse' }, req('203.0.113.33'))
    expect(user).toBeNull()
  })
})

import { describe, it, expect, vi } from 'vitest'

// otplib 13 dropped the `authenticator` export. Simulate it: createAdminAuth must
// fail at startup with a clear message, not reject every code as "invalid".
vi.mock('otplib', () => ({ authenticator: undefined }))

describe('createAdminAuth — otplib without the v12 authenticator API', () => {
  it('throws a clear error at startup', async () => {
    const { createAdminAuth } = await import('./auth')
    expect(() =>
      createAdminAuth({ adminEmail: 'a@b.c', adminPassword: 'p', totpSecret: 'JBSWY3DPEHPK3PXP', nextAuthSecret: 'x' }),
    ).toThrow(/otplib v12 is required/)
  })
})

import { describe, it, expect } from 'vitest'
import { validateTOTPCode, generateTOTPSecret, generateTOTPCode, totpKeyUri } from './totp'

describe('totp', () => {
  it('validates a freshly generated code for the same secret', () => {
    const secret = generateTOTPSecret()
    expect(validateTOTPCode(generateTOTPCode(secret), secret).isValid).toBe(true)
  })
  it('rejects a code generated for a different secret', () => {
    const a = generateTOTPSecret()
    const b = generateTOTPSecret()
    expect(validateTOTPCode(generateTOTPCode(b), a).isValid).toBe(false)
  })
  it('rejects non-6-digit input', () => {
    const secret = generateTOTPSecret()
    expect(validateTOTPCode('123', secret).isValid).toBe(false)
    expect(validateTOTPCode('abcdef', secret).isValid).toBe(false)
  })
  it('rejects when no secret is configured', () => {
    expect(validateTOTPCode('123456', '').isValid).toBe(false)
  })
  it('builds the otpauth URI an authenticator app enrolls from', () => {
    const uri = totpKeyUri('admin@example.com', 'Example Admin', 'JBSWY3DPEHPK3PXP')
    expect(uri.startsWith('otpauth://totp/')).toBe(true)
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP')
    expect(uri).toContain('issuer=Example%20Admin')
  })
})

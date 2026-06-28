import { describe, it, expect } from 'vitest'
import { validateTOTPCode, generateTOTPSecret, generateTOTPCode } from './totp'

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
})

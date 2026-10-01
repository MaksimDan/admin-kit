import { authenticator } from 'otplib'

export type ValidationResult = {
  isValid: boolean
  error?: string
}

// Validate a 6-digit TOTP code against a base32 secret. Matches Google
// Authenticator defaults (30s step, 1-step window). The secret is passed in (the
// kit reads no env directly — createAdminAuth supplies it).
export const validateTOTPCode = (code: string, secret: string): ValidationResult => {
  try {
    if (!secret) return { isValid: false, error: 'Authentication key not configured' }
    if (!/^\d{6}$/.test(code)) return { isValid: false, error: 'Code must be 6 digits' }

    // Scope the verify options to a throwaway cloned instance instead of mutating
    // the shared global authenticator.options (which would leak/persist across
    // calls). clone() carries over the preset's crypto plugins; create() would
    // drop them. Behavior is identical: 30s step, 1-step window, 6 digits.
    const isValid = authenticator
      .clone({ window: 1, step: 30, digits: 6 })
      .verify({ token: code, secret })
    return { isValid, error: isValid ? undefined : 'Invalid code' }
  } catch (error) {
    return { isValid: false, error: (error as Error).message }
  }
}

// otplib 13 removed the `authenticator` API this module is built on. Fail at
// startup with a clear message instead of rejecting every code (validateTOTPCode
// would catch the TypeError and report "invalid code").
export function assertTotpSupport(): void {
  if (typeof authenticator?.clone !== 'function') {
    throw new Error('admin-kit: otplib v12 is required (otplib 13 removed the authenticator API).')
  }
}

// A new base32 seed for AUTHENTICATION_KEY.
export const generateTOTPSecret = (): string => authenticator.generateSecret()

// The otpauth:// URI an authenticator app enrolls from (render it as a QR code).
export const totpKeyUri = (accountName: string, issuer: string, secret: string): string =>
  authenticator.keyuri(accountName, issuer, secret)

// Useful for tests: the current code for a secret.
export const generateTOTPCode = (secret: string): string => authenticator.generate(secret)

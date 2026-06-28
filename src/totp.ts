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

    authenticator.options = { window: 1, step: 30, digits: 6 }
    const isValid = authenticator.verify({ token: code, secret })
    return { isValid, error: isValid ? undefined : 'Invalid code' }
  } catch (error) {
    return { isValid: false, error: (error as Error).message }
  }
}

export const generateTOTPSecret = (): string => authenticator.generateSecret()

// Useful for tests: the current code for a secret.
export const generateTOTPCode = (secret: string): string => authenticator.generate(secret)

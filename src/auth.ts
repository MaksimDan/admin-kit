import { createHash, timingSafeEqual } from 'node:crypto'
import type { AuthOptions } from 'next-auth'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import CredentialsProvider from 'next-auth/providers/credentials'
import { rateLimit, clientIpFromHeaders } from './rateLimit'
import { assertTotpSupport, validateTOTPCode } from './totp'

// Constant-time string equality: hash both sides to a fixed 32-byte digest so the
// lengths always match (timingSafeEqual throws on length mismatch) and the compare
// itself does not short-circuit on the first differing byte.
const constantTimeEqual = (a: string, b: string): boolean =>
  timingSafeEqual(createHash('sha256').update(a, 'utf8').digest(), createHash('sha256').update(b, 'utf8').digest())

// Single env-based admin auth, packaged. createAdminAuth() returns the next-auth
// authOptions (mount it in your [...nextauth] route) plus requireAdmin/isAdminUser
// bound to it. Login requires email + password + a TOTP code; the session has an
// ABSOLUTE lifetime (default 30 min from login, not rolling) enforced in the
// callbacks. See augment.ts for the Session/JWT type fields used here.

export interface AdminAuthConfig {
  adminEmail: string
  adminPassword: string
  totpSecret: string // base32 TOTP seed
  nextAuthSecret: string
  sessionTtlSeconds?: number // absolute window; default 30 min
  // The client IP the per-IP login limit keys on. The default trusts the first
  // X-Forwarded-For entry, which only a proxy that overwrites the header (Vercel
  // does) makes trustworthy; elsewhere, read the header your proxy sets.
  clientIp?: (headers: Parameters<typeof clientIpFromHeaders>[0]) => string
}

// After this many wrong codes from someone who knew the password, every login is
// refused until the window ends. The per-IP limit alone can't stop a leaked
// password plus rotating IPs from guessing the 6-digit code. Only failures past
// the password count, so this can't be used to lock the admin out without it.
const MAX_TOTP_FAILURES = 10
const TOTP_FAILURE_WINDOW_MS = 15 * 60_000

export interface AdminAuth {
  authOptions: AuthOptions
  requireAdmin: () => Promise<NextResponse | null>
  isAdminUser: () => Promise<boolean>
}

export function createAdminAuth(config: AdminAuthConfig): AdminAuth {
  if (!config.nextAuthSecret) {
    throw new Error('admin-kit: createAdminAuth requires nextAuthSecret')
  }
  if (!config.adminEmail || !config.adminPassword) {
    throw new Error('admin-kit: createAdminAuth requires adminEmail and adminPassword')
  }
  if (!config.totpSecret) {
    throw new Error('admin-kit: createAdminAuth requires totpSecret')
  }
  assertTotpSupport()
  const clientIp = config.clientIp ?? clientIpFromHeaders

  // Only honour a positive ttl; 0 / negative / non-number falls back to 30 min.
  const ttlSeconds =
    typeof config.sessionTtlSeconds === 'number' && config.sessionTtlSeconds > 0
      ? config.sessionTtlSeconds
      : 30 * 60
  const ttlMs = ttlSeconds * 1000

  // Replay guard: a TOTP code is single-use within this process. Holds the last
  // code that successfully authenticated so an immediate reuse is rejected.
  let lastAcceptedTotp: string | null = null

  // Wrong codes entered after a correct password, in the current window.
  let totpFailures = { count: 0, resetAt: 0 }
  const totpLocked = () => Date.now() < totpFailures.resetAt && totpFailures.count >= MAX_TOTP_FAILURES
  const recordTotpFailure = () => {
    const now = Date.now()
    if (now >= totpFailures.resetAt) totpFailures = { count: 0, resetAt: now + TOTP_FAILURE_WINDOW_MS }
    totpFailures.count += 1
  }

  const authOptions: AuthOptions = {
    providers: [
      CredentialsProvider({
        name: 'Credentials',
        credentials: {
          email: { label: 'Email', type: 'email' },
          password: { label: 'Password', type: 'password' },
          totp: { label: '2FA Code', type: 'text' },
        },
        async authorize(credentials, req) {
          // Throttle online brute force per client IP (covers password AND TOTP).
          const ip = clientIp(req?.headers)
          if (!rateLimit(`login:${ip}`, 10, 60_000).allowed) {
            console.warn(`Login rate limit exceeded for ${ip}`)
            return null
          }

          if (!credentials?.email || !credentials?.password || !credentials?.totp) {
            return null
          }
          // Constant-time, non-short-circuiting compare of BOTH factors (compute
          // each before branching) so neither timing nor evaluation order leaks
          // which field was wrong. Uniform null on any mismatch.
          const emailOk = constantTimeEqual(credentials.email, config.adminEmail)
          const passOk = constantTimeEqual(credentials.password, config.adminPassword)
          if (!emailOk || !passOk) {
            return null
          }
          // Too many wrong codes after a correct password: refuse even a right
          // one until the window ends, or the lock would only slow the guessing.
          if (totpLocked()) {
            console.warn('Admin login locked: too many wrong authenticator codes after a correct password')
            return null
          }
          // Third factor: TOTP. No session is issued unless this passes.
          if (!validateTOTPCode(credentials.totp, config.totpSecret).isValid) {
            recordTotpFailure()
            return null
          }
          // Reject reuse of an already-accepted code; otherwise record it.
          if (credentials.totp === lastAcceptedTotp) {
            return null
          }
          lastAcceptedTotp = credentials.totp

          return { id: '1', email: credentials.email, role: 'admin' }
        },
      }),
    ],
    pages: { signIn: '/admin/login' },
    session: {
      strategy: 'jwt',
      // Backstop only (cookie/raw-JWT lifetime). next-auth re-signs the JWT on
      // every read, so this alone is a ROLLING window; the authoritative absolute
      // boundary is token.expiresAt, enforced in the session callback.
      maxAge: ttlSeconds,
    },
    jwt: { maxAge: ttlSeconds },
    callbacks: {
      async jwt({ token, user }) {
        if (user) {
          // LOGIN ONLY: stamp role + the ABSOLUTE deadline exactly once; never
          // refreshed on later reads, so the window does not slide.
          token.role = user.role
          token.expiresAt = Date.now() + ttlMs
        } else if (typeof token.expiresAt === 'number' && Date.now() >= token.expiresAt) {
          // LATER READS: once past the absolute deadline, strip the role from the
          // token too (fail closed). This only rewrites the cookie on a session
          // read: until one happens, a cookie issued before the deadline still
          // decodes with role 'admin', so middleware using getToken() must check
          // expiresAt itself.
          token.role = null
        }
        return token
      },
      async session({ session, token }) {
        // The ONLY place the absolute deadline is enforced. Past it we STRIP the
        // admin role (fail closed) so requireAdmin() rejects — we keep a valid
        // session object rather than returning null (null breaks next-auth's
        // client /api/auth/session route).
        const expired = typeof token.expiresAt !== 'number' || Date.now() >= token.expiresAt
        if (session.user) {
          session.user.role = expired ? null : token.role
        }
        session.expiresAt = token.expiresAt
        return session
      },
    },
    secret: config.nextAuthSecret,
  }

  async function isAdminUser(): Promise<boolean> {
    const session = await getServerSession(authOptions)
    return session?.user?.role === 'admin'
  }

  async function requireAdmin(): Promise<NextResponse | null> {
    if (await isAdminUser()) return null
    return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 })
  }

  return { authOptions, requireAdmin, isAdminUser }
}

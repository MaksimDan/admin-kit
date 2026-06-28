import type { AuthOptions } from 'next-auth'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import CredentialsProvider from 'next-auth/providers/credentials'
import { rateLimit, clientIpFromHeaders } from './rateLimit'
import { validateTOTPCode } from './totp'

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
}

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

  const ttlSeconds = config.sessionTtlSeconds ?? 30 * 60
  const ttlMs = ttlSeconds * 1000

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
          const ip = clientIpFromHeaders(req?.headers)
          if (!rateLimit(`login:${ip}`, 10, 60_000).allowed) {
            console.warn(`Login rate limit exceeded for ${ip}`)
            return null
          }

          if (!credentials?.email || !credentials?.password || !credentials?.totp) {
            return null
          }
          if (credentials.email !== config.adminEmail || credentials.password !== config.adminPassword) {
            return null
          }
          // Third factor: TOTP. No session is issued unless this passes.
          if (!validateTOTPCode(credentials.totp, config.totpSecret).isValid) {
            return null
          }

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

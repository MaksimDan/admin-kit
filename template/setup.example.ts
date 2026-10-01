// Copy to: src/lib/admin-kit-setup.ts
// Server-only. Builds the admin auth and a kit instance; route files import
// crud/reorder from here, so a route can never run before the kit is configured.
//
// The kit PROVIDES auth AND the Mongo connection: createAdminAuth() builds the
// next-auth options + requireAdmin from your single admin's credentials, and
// createClientPromise() (from /mongo) is the HMR-safe Mongo client singleton.
// You only supply env.
import { createAdminAuth, createAdminKit } from '@maksimdan/admin-kit/server'
import { createClientPromise } from '@maksimdan/admin-kit/mongo'

export const { authOptions, requireAdmin } = createAdminAuth({
  adminEmail: process.env.ADMIN_EMAIL!,
  adminPassword: process.env.ADMIN_PASSWORD!,
  totpSecret: process.env.AUTHENTICATION_KEY!,
  nextAuthSecret: process.env.NEXTAUTH_SECRET!,
})

// getClient is called per request: createClientPromise() reuses one client and
// retries after a failed connect instead of failing every later request.
export const { crud, reorder } = createAdminKit({
  getClient: createClientPromise,
  requireAdmin,
  dbName: process.env.MONGODB_DB,
})

// Then, app-level (Next can't package route segments):
//   app/api/auth/[...nextauth]/route.ts
//     import NextAuth from 'next-auth'
//     import { authOptions } from '@/lib/admin-kit-setup'
//     const handler = NextAuth(authOptions)
//     export { handler as GET, handler as POST }
//
//   app/admin/login/page.tsx
//     'use client'
//     import { LoginForm } from '@maksimdan/admin-kit'
//     export default () => <LoginForm />
//
//   app/providers.tsx -> wrap children in <SessionProvider> (next-auth/react)
//   admin dashboard header -> <SessionCountdown /> (from @maksimdan/admin-kit)

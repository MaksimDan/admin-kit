// Copy to: src/lib/admin-kit-setup.ts
// Run ONCE before any crud route handles a request — import it from your route
// files (and/or src/config/resources.server.ts).
//
// The kit now PROVIDES auth AND the Mongo connection: createAdminAuth() builds the
// next-auth options + requireAdmin from your single admin's credentials, and
// createClientPromise() (from /mongo) is the HMR-safe Mongo client singleton —
// import it here instead of hand-rolling a '@/lib/mongodb'. You only supply env.
import { createAdminAuth, configureAdminKit } from '@maksimdan/admin-kit/server'
import { createClientPromise } from '@maksimdan/admin-kit/mongo'

const clientPromise = createClientPromise() // HMR-safe singleton; reads MONGODB_URI

export const { authOptions, requireAdmin } = createAdminAuth({
  adminEmail: process.env.ADMIN_EMAIL!,
  adminPassword: process.env.ADMIN_PASSWORD!,
  totpSecret: process.env.AUTHENTICATION_KEY!,
  nextAuthSecret: process.env.NEXTAUTH_SECRET!,
})

// Hand the kit's crud() the Mongo client + the admin check.
configureAdminKit({ clientPromise, requireAdmin, dbName: process.env.MONGODB_DB })

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

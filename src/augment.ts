// Ambient augmentation of next-auth with the admin role + absolute-expiry fields
// the kit's auth uses. This is a module (the type import makes it one), so the
// `declare module` blocks MERGE with next-auth's types. The kit's entry points
// `import './augment'`, but this file is type-only: it declares ambient types and
// compiles to nothing (no runtime side effect). The import simply pulls these
// declarations into the type graph, so any consumer of the package picks them up
// without writing their own next-auth.d.ts.
import type { DefaultSession, DefaultUser } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    expiresAt?: number // epoch ms; absolute login+TTL deadline (countdown source)
    user?: {
      id?: string | null
      email?: string | null
      role?: string | null
    } & DefaultSession['user']
  }

  interface User extends DefaultUser {
    role?: string | null
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: string | null
    expiresAt?: number // epoch ms; absolute deadline stamped at login
  }
}

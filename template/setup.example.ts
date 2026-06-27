// Copy to: src/lib/admin-kit-setup.ts
// Run ONCE before any crud() route handles a request. The simplest way is to
// import this file at the top of your src/config/resources.server.ts (or any
// module your route files import).
//
// This is the injection seam: the kit gets the host's Mongo connection + admin
// check here, and nowhere else.
import { configureAdminKit } from '@maksimdan/admin-kit/server'
import clientPromise from '@/lib/mongodb'
import { requireAdmin } from '@/lib/auth-middleware'

configureAdminKit({
  clientPromise,
  requireAdmin,
  dbName: process.env.MONGODB_DB,
})

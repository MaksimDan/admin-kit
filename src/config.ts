import type { Db, MongoClient } from 'mongodb'
import type { NextResponse } from 'next/server'

// The injection seam. admin-kit is datastore- and auth-agnostic: the host app
// owns the MongoDB connection and the admin auth check and hands them to the
// kit, either bound to a kit instance with createAdminKit() (preferred: its
// crud()/reorder() cannot run unconfigured) or once at startup with
// configureAdminKit(), which the standalone crud()/reorder() read per request.

export type RequireAdminFn = () => Promise<NextResponse | null>

export interface AdminKitConfig {
  /**
   * Returns the Mongo client. Called on every request, so a connect that failed
   * once is retried; pass createClientPromise from '@maksimdan/admin-kit/mongo',
   * which memoizes the client and forgets a failed attempt.
   */
  getClient?: () => Promise<MongoClient>
  /**
   * @deprecated Pass getClient. A single promise that rejects (one failed connect
   * at cold start) stays rejected, so every request fails until the process restarts.
   */
  clientPromise?: Promise<MongoClient>
  /** Returns a 401 NextResponse when the caller is not an admin, else null. */
  requireAdmin: RequireAdminFn
  /** Database name; defaults to process.env.MONGODB_DB. */
  dbName?: string
}

// What crud()/reorder() need per request: a Db and the admin check.
export interface KitRuntime {
  getDb: () => Promise<Db>
  requireAdmin: RequireAdminFn
}

function assertValid(config: AdminKitConfig): void {
  if (!config.getClient && !config.clientPromise) {
    throw new Error('admin-kit: pass getClient (e.g. createClientPromise from /mongo) to configure the kit.')
  }
  if (typeof config.requireAdmin !== 'function') {
    throw new Error('admin-kit: pass requireAdmin (from createAdminAuth) to configure the kit.')
  }
}

async function dbFrom(config: AdminKitConfig): Promise<Db> {
  const client = await (config.getClient ? config.getClient() : config.clientPromise!)
  return client.db(config.dbName ?? process.env.MONGODB_DB)
}

// A runtime bound to one config, for createAdminKit().
export function bindRuntime(config: AdminKitConfig): KitRuntime {
  assertValid(config)
  return { getDb: () => dbFrom(config), requireAdmin: () => config.requireAdmin() }
}

let globalConfig: AdminKitConfig | undefined

export function configureAdminKit(config: AdminKitConfig): void {
  assertValid(config)
  globalConfig = config
}

function requireGlobalConfig(): AdminKitConfig {
  if (!globalConfig) {
    throw new Error(
      'admin-kit: call configureAdminKit({ getClient, requireAdmin }) before using crud(), or use createAdminKit().',
    )
  }
  return globalConfig
}

// The runtime behind the standalone crud()/reorder(). It reads the global config
// at request time, so crud() may be called before configureAdminKit() runs.
export const globalRuntime: KitRuntime = {
  getDb: async () => dbFrom(requireGlobalConfig()),
  requireAdmin: async () => requireGlobalConfig().requireAdmin(),
}

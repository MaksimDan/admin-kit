import type { MongoClient } from 'mongodb'
import type { NextResponse } from 'next/server'

// The injection seam. admin-kit is datastore- and auth-agnostic: the host app
// owns the MongoDB connection and the admin auth check, and hands them to the kit
// once at startup via configureAdminKit(). crud() reads them through the getters.

export type RequireAdminFn = () => Promise<NextResponse | null>

let clientPromise: Promise<MongoClient> | undefined
let requireAdminFn: RequireAdminFn | undefined
let dbName: string | undefined

export function configureAdminKit(opts: {
  /** The host's Mongo client promise (e.g. from its lib/mongodb). */
  clientPromise: Promise<MongoClient>
  /** Returns a 401 NextResponse when the caller is not an admin, else null. */
  requireAdmin: RequireAdminFn
  /** Database name; defaults to process.env.MONGODB_DB. */
  dbName?: string
}): void {
  clientPromise = opts.clientPromise
  requireAdminFn = opts.requireAdmin
  dbName = opts.dbName
}

export function getClientPromise(): Promise<MongoClient> {
  if (!clientPromise) {
    throw new Error('admin-kit: call configureAdminKit({ clientPromise, requireAdmin }) before using crud().')
  }
  return clientPromise
}

export function getDbName(): string | undefined {
  return dbName ?? process.env.MONGODB_DB
}

export async function requireAdmin(): Promise<NextResponse | null> {
  if (!requireAdminFn) {
    throw new Error('admin-kit: call configureAdminKit({ clientPromise, requireAdmin }) before using crud().')
  }
  return requireAdminFn()
}

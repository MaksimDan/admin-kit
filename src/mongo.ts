// Server-only. The canonical Next.js + MongoDB connection: one MongoClient per
// process, memoized so Next's dev Hot Module Replacement doesn't open a new
// connection on every reload. Reads MONGODB_URI from the environment; pass
// options on the first call to customize the connection (pool size, TLS, etc.).
import { MongoClient, type MongoClientOptions } from 'mongodb'

declare global {
  // eslint-disable-next-line no-var
  var _adminKitMongoClientPromise: Promise<MongoClient> | undefined
}

let memoized: Promise<MongoClient> | undefined

export function createClientPromise(options: MongoClientOptions = {}): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    throw new Error('Invalid/Missing environment variable: "MONGODB_URI"')
  }

  // Dev: cache on a global so HMR module reloads reuse the same connection.
  if (process.env.NODE_ENV === 'development') {
    if (!global._adminKitMongoClientPromise) {
      global._adminKitMongoClientPromise = new MongoClient(uri, options).connect()
    }
    return global._adminKitMongoClientPromise
  }

  // Prod / test: cache at module scope (one connection per process).
  if (!memoized) {
    memoized = new MongoClient(uri, options).connect()
  }
  return memoized
}

export type { MongoClient } from 'mongodb'

// Server-only. The canonical Next.js + MongoDB connection: one MongoClient per
// process, memoized so Next's dev Hot Module Replacement doesn't open a new
// connection on every reload. Reads MONGODB_URI from the environment; pass
// options on the first call to customize the connection (pool size, TLS, etc.).
import { MongoClient, type MongoClientOptions } from 'mongodb'

declare global {
  var _adminKitMongoClientPromise: Promise<MongoClient> | undefined
}

let memoized: Promise<MongoClient> | undefined

// Connect once and memoize the in-flight/resolved promise via get/set. Crucially,
// a *failed* connect must not be cached forever: if connect() rejects we clear the
// memo (so the next call retries) and rethrow so the caller still sees the error.
// Without this, a single transient failure would poison every later call until the
// process restarts.
function memoizedConnect(
  get: () => Promise<MongoClient> | undefined,
  set: (promise: Promise<MongoClient> | undefined) => void,
  uri: string,
  options: MongoClientOptions,
): Promise<MongoClient> {
  const existing = get()
  if (existing) return existing

  const pending: Promise<MongoClient> = new MongoClient(uri, options)
    .connect()
    .catch((err) => {
      // Reset only if we're still the memoized promise, so we don't clobber a
      // newer attempt that may have replaced us in the meantime.
      if (get() === pending) set(undefined)
      throw err
    })
  set(pending)
  return pending
}

export function createClientPromise(options: MongoClientOptions = {}): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    throw new Error('Invalid/Missing environment variable: "MONGODB_URI"')
  }

  // Dev: cache on a global so HMR module reloads reuse the same connection.
  if (process.env.NODE_ENV === 'development') {
    return memoizedConnect(
      () => global._adminKitMongoClientPromise,
      (promise) => {
        global._adminKitMongoClientPromise = promise
      },
      uri,
      options,
    )
  }

  // Prod / test: cache at module scope (one connection per process).
  return memoizedConnect(
    () => memoized,
    (promise) => {
      memoized = promise
    },
    uri,
    options,
  )
}

export type { MongoClient } from 'mongodb'

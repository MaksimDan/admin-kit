import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Avoid a real network connection — stand in a trivial client.
vi.mock('mongodb', () => ({
  MongoClient: class {
    constructor(
      public uri: string,
      public options: unknown,
    ) {}
    connect() {
      return Promise.resolve(this as unknown)
    }
  },
}))

describe('createClientPromise', () => {
  const OLD = process.env.MONGODB_URI
  beforeEach(() => {
    vi.resetModules() // fresh module-scope memo per test
    process.env.MONGODB_URI = 'mongodb://localhost:27017'
  })
  afterEach(() => {
    process.env.MONGODB_URI = OLD
  })

  it('throws a clear error when MONGODB_URI is missing', async () => {
    delete process.env.MONGODB_URI
    const { createClientPromise } = await import('./mongo')
    expect(() => createClientPromise()).toThrow(/MONGODB_URI/)
  })

  it('returns the same memoized promise on repeated calls', async () => {
    const { createClientPromise } = await import('./mongo')
    expect(createClientPromise()).toBe(createClientPromise())
  })
})

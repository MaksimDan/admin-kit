import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// A controllable connect() so individual tests can simulate failures. Declared
// via vi.hoisted so the hoisted vi.mock factory below can reference it.
const mongoMock = vi.hoisted(() => ({
  connect: vi.fn(),
}))

// Avoid a real network connection — stand in a trivial client whose connect()
// behavior is driven by mongoMock.connect (configured per test in beforeEach).
vi.mock('mongodb', () => ({
  MongoClient: class {
    constructor(
      public uri: string,
      public options: unknown,
    ) {}
    connect() {
      return mongoMock.connect(this)
    }
  },
}))

describe('createClientPromise', () => {
  const OLD = process.env.MONGODB_URI
  beforeEach(() => {
    vi.resetModules() // fresh module-scope memo per test
    process.env.MONGODB_URI = 'mongodb://localhost:27017'
    // Default: connect() succeeds, resolving to the client (like the real driver).
    mongoMock.connect.mockReset()
    mongoMock.connect.mockImplementation((client: unknown) => Promise.resolve(client))
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

  it('retries after a failed connect instead of caching the rejection', async () => {
    let attempts = 0
    mongoMock.connect.mockImplementation((client: unknown) => {
      attempts += 1
      return attempts === 1
        ? Promise.reject(new Error('connect failed'))
        : Promise.resolve(client)
    })

    const { createClientPromise } = await import('./mongo')

    // First call surfaces the connection error...
    await expect(createClientPromise()).rejects.toThrow(/connect failed/)
    // ...and the rejection is NOT memoized: the next call retries and succeeds.
    await expect(createClientPromise()).resolves.toBeDefined()
    expect(attempts).toBe(2)
  })
})

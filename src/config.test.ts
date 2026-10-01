import { describe, it, expect, vi } from 'vitest'
import type { MongoClient } from 'mongodb'

// A client whose db(name) hands back a tag saying which database was opened.
const fakeClient = () => ({ db: (name?: string) => ({ name }) }) as unknown as MongoClient

// config state is module-global, so each test re-imports a fresh module.
describe('config seam', () => {
  it('the global runtime throws a clear error before configureAdminKit', async () => {
    vi.resetModules()
    const c = await import('./config')
    await expect(c.globalRuntime.getDb()).rejects.toThrow(/configureAdminKit/)
    await expect(c.globalRuntime.requireAdmin()).rejects.toThrow(/configureAdminKit/)
  })

  it('rejects a config without a client source or without requireAdmin', async () => {
    vi.resetModules()
    const c = await import('./config')
    expect(() => c.configureAdminKit({ requireAdmin: async () => null })).toThrow(/getClient/)
    expect(() => c.configureAdminKit({ getClient: async () => fakeClient() } as never)).toThrow(/requireAdmin/)
  })

  it('calls getClient per request, so a connect that failed once is retried', async () => {
    vi.resetModules()
    const c = await import('./config')
    let calls = 0
    c.configureAdminKit({
      getClient: async () => {
        calls += 1
        if (calls === 1) throw new Error('transient: server selection timed out')
        return fakeClient()
      },
      requireAdmin: async () => null,
      dbName: 'mydb',
    })
    await expect(c.globalRuntime.getDb()).rejects.toThrow(/transient/)
    await expect(c.globalRuntime.getDb()).resolves.toEqual({ name: 'mydb' })
    expect(calls).toBe(2)
  })

  it('still accepts the legacy clientPromise', async () => {
    vi.resetModules()
    const c = await import('./config')
    c.configureAdminKit({ clientPromise: Promise.resolve(fakeClient()), requireAdmin: async () => null, dbName: 'legacy' })
    await expect(c.globalRuntime.getDb()).resolves.toEqual({ name: 'legacy' })
    expect(await c.globalRuntime.requireAdmin()).toBeNull()
  })

  it('the database name falls back to process.env.MONGODB_DB', async () => {
    vi.resetModules()
    const c = await import('./config')
    process.env.MONGODB_DB = 'envdb'
    c.configureAdminKit({ getClient: async () => fakeClient(), requireAdmin: async () => null })
    await expect(c.globalRuntime.getDb()).resolves.toEqual({ name: 'envdb' })
  })

  it('a bound runtime needs no global config', async () => {
    vi.resetModules()
    const c = await import('./config')
    const kit = c.bindRuntime({ getClient: async () => fakeClient(), requireAdmin: async () => null, dbName: 'bound' })
    await expect(kit.getDb()).resolves.toEqual({ name: 'bound' })
    await expect(c.globalRuntime.getDb()).rejects.toThrow(/configureAdminKit/)
  })
})

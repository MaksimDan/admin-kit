import { describe, it, expect, vi } from 'vitest'
import type { MongoClient } from 'mongodb'

const fakeClient = () => Promise.resolve({} as unknown as MongoClient)

// config state is module-global, so each test re-imports a fresh module.
describe('config seam', () => {
  it('getters throw before configureAdminKit', async () => {
    vi.resetModules()
    const c = await import('./config')
    expect(() => c.getClientPromise()).toThrow(/configureAdminKit/)
    await expect(c.requireAdmin()).rejects.toThrow(/configureAdminKit/)
  })

  it('exposes the configured client, dbName, and requireAdmin', async () => {
    vi.resetModules()
    const c = await import('./config')
    const client = fakeClient()
    c.configureAdminKit({ clientPromise: client, requireAdmin: async () => null, dbName: 'mydb' })
    expect(c.getClientPromise()).toBe(client)
    expect(c.getDbName()).toBe('mydb')
    expect(await c.requireAdmin()).toBeNull()
  })

  it('getDbName falls back to process.env.MONGODB_DB', async () => {
    vi.resetModules()
    const c = await import('./config')
    process.env.MONGODB_DB = 'envdb'
    c.configureAdminKit({ clientPromise: fakeClient(), requireAdmin: async () => null })
    expect(c.getDbName()).toBe('envdb')
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'
import type { MongoClient } from 'mongodb'
import { configureAdminKit } from './config'
import { crud } from './crud'
import { defineResource } from './resource'

const OID = '507f1f77bcf86cd799439011'

/* eslint-disable @typescript-eslint/no-explicit-any */
const cursor: any = { sort: () => cursor, skip: () => cursor, limit: () => cursor, toArray: async () => [] }
// Records the last update operand passed to findOneAndUpdate so PATCH tests can
// assert the exact $set shape (e.g. that omitted fields aren't nulled).
let lastUpdate: any = null
const collection = {
  find: () => cursor,
  findOne: async () => null,
  insertOne: async () => ({ insertedId: OID }),
  findOneAndUpdate: async (_filter: any, update: any) => {
    lastUpdate = update
    return null
  },
  deleteOne: async () => ({ deletedCount: 1 }),
  countDocuments: async () => 0,
}
const fakeClient = Promise.resolve({ db: () => ({ collection: () => collection }) } as unknown as MongoClient)

let authResult: NextResponse | null = null
configureAdminKit({ clientPromise: fakeClient, requireAdmin: async () => authResult, dbName: 'test' })
const admin = () => { authResult = null }
const notAdmin = () => { authResult = NextResponse.json({ error: 'no' }, { status: 401 }) }

const req = (path: string, method = 'GET', body?: unknown) =>
  new Request(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

const widgets = defineResource({
  name: 'widgets',
  label: 'Widget',
  list: { public: true },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'qty', type: 'number' },
  ],
})

beforeEach(() => admin())

describe('crud — standard resource', () => {
  const { GET, POST, PATCH, DELETE } = crud(widgets)

  it('GET (public) -> 200', async () => expect((await GET(req('/api/widgets'))).status).toBe(200))

  it('POST requires admin', async () => {
    notAdmin()
    expect((await POST(req('/api/widgets', 'POST', { name: 'a' }))).status).toBe(401)
  })
  it('POST validates the body (400 on missing required field)', async () => {
    expect((await POST(req('/api/widgets', 'POST', {}))).status).toBe(400)
  })
  it('POST happy -> 200 with the stored doc (_id + persisted fields)', async () => {
    const res = await POST(req('/api/widgets', 'POST', { name: 'a', qty: 1 }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json._id).toBe(OID)
    expect(json.name).toBe('a')
    expect(json.qty).toBe(1)
  })
  it('POST persists zod-coerced values (numeric string -> number)', async () => {
    const res = await POST(req('/api/widgets', 'POST', { name: 'a', qty: '5' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.qty).toBe(5)
    expect(typeof json.qty).toBe('number')
  })

  it('PATCH validates before the id check (400 on bad body even with a bad id)', async () => {
    expect((await PATCH(req('/api/widgets', 'PATCH', { _id: 'bad' }))).status).toBe(400)
  })
  it('PATCH with a valid body but bad id -> 400', async () => {
    expect((await PATCH(req('/api/widgets', 'PATCH', { name: 'a', _id: 'notanid' }))).status).toBe(400)
  })
  it('PATCH not found -> 404', async () => {
    expect((await PATCH(req('/api/widgets', 'PATCH', { name: 'a', _id: OID }))).status).toBe(404)
  })
  it('PATCH is partial — an omitted optional field is NOT written to $set (not nulled)', async () => {
    lastUpdate = null
    await PATCH(req('/api/widgets', 'PATCH', { name: 'a', _id: OID }))
    expect(lastUpdate.$set.name).toBe('a')
    // qty was omitted from the body, so it must be absent from $set rather than
    // overwritten with null/0 (the pre-fix behaviour clobbered omitted fields).
    expect('qty' in lastUpdate.$set).toBe(false)
  })
  it('PATCH writes (and coerces) the fields that ARE present', async () => {
    lastUpdate = null
    await PATCH(req('/api/widgets', 'PATCH', { name: 'a', qty: '7', _id: OID }))
    expect(lastUpdate.$set.name).toBe('a')
    expect(lastUpdate.$set.qty).toBe(7)
    expect(typeof lastUpdate.$set.qty).toBe('number')
  })

  it('DELETE requires admin', async () => {
    notAdmin()
    expect((await DELETE(req(`/api/widgets?id=${OID}`, 'DELETE'))).status).toBe(401)
  })
  it('DELETE bad id -> 400', async () => {
    expect((await DELETE(req('/api/widgets?id=bad', 'DELETE'))).status).toBe(400)
  })
  it('DELETE happy -> 200 { success }', async () => {
    const res = await DELETE(req(`/api/widgets?id=${OID}`, 'DELETE'))
    expect(res.status).toBe(200)
    expect((await res.json()).success).toBe(true)
  })
})

describe('crud — list.public: false (admin-only GET)', () => {
  const secret = defineResource({ name: 'secret', label: 'Secret', list: { public: false }, fields: [] })
  const { GET } = crud(secret)
  it('401 when not admin', async () => {
    notAdmin()
    expect((await GET(req('/api/secret'))).status).toBe(401)
  })
  it('200 when admin', async () => {
    admin()
    expect((await GET(req('/api/secret'))).status).toBe(200)
  })
})

describe('crud — secure by default (GET admin-only without list.public: true)', () => {
  // No list config at all => GET must require admin (intentional breaking change).
  const plain = defineResource({ name: 'plain', label: 'Plain', fields: [] })
  const { GET } = crud(plain)
  it('401 when not admin', async () => {
    notAdmin()
    expect((await GET(req('/api/plain'))).status).toBe(401)
  })
  it('200 when admin', async () => {
    admin()
    expect((await GET(req('/api/plain'))).status).toBe(200)
  })
})

describe('crud — hooks', () => {
  it('buildWrite returning a NextResponse short-circuits POST', async () => {
    const r = defineResource({ name: 'r1', label: 'R1', fields: [{ name: 'name', type: 'text', required: true }] })
    const { POST } = crud({ ...r, hooks: { buildWrite: () => NextResponse.json({ error: 'no' }, { status: 422 }) } })
    expect((await POST(req('/api/r1', 'POST', { name: 'a' }))).status).toBe(422)
  })
  it('customPatch fully replaces PATCH', async () => {
    const r = defineResource({ name: 'r2', label: 'R2', fields: [] })
    const { PATCH } = crud({ ...r, hooks: { customPatch: async () => NextResponse.json({ custom: true }, { status: 200 }) } })
    expect((await (await PATCH(req('/api/r2', 'PATCH', {}))).json()).custom).toBe(true)
  })
  it('mapCreateResponse shapes the POST response', async () => {
    const r = defineResource({ name: 'r3', label: 'R3', fields: [{ name: 'name', type: 'text', required: true }] })
    const { POST } = crud({ ...r, hooks: { mapCreateResponse: ({ insertedId }) => ({ id: insertedId, ok: true }) } })
    const json = await (await POST(req('/api/r3', 'POST', { name: 'a' }))).json()
    expect(json).toEqual({ id: OID, ok: true })
  })
})

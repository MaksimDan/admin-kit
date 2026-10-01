import { describe, it, expect, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'
import type { MongoClient } from 'mongodb'
import { configureAdminKit } from './config'
import { crud, reorder, createAdminKit } from './crud'
import { defineResource } from './resource'
import type { ReadContext } from './resource'

const OID = '507f1f77bcf86cd799439011'
const OID2 = '507f1f77bcf86cd799439012'
const OID3 = '507f1f77bcf86cd799439013'

/* eslint-disable @typescript-eslint/no-explicit-any */
// A fake collection that records what crud() asked of it: the find query, the
// sort/skip/limit applied, the findOne filter, the inserted doc, and the update
// operand (so tests can assert the exact $set shape).
let calls: { find?: any; sort?: any; skip?: number; limit?: number; findOne?: any; insert?: any; update?: any; bulk?: any }
let findOneResult: any = null
const cursor: any = {
  sort: (s: any) => ((calls.sort = s), cursor),
  skip: (n: number) => ((calls.skip = n), cursor),
  limit: (n: number) => ((calls.limit = n), cursor),
  toArray: async () => [{ _id: OID, n: 1 }, { _id: OID2, n: 2 }],
}
const collection = {
  find: (q: any) => ((calls.find = q), cursor),
  findOne: async (f: any) => ((calls.findOne = f), findOneResult),
  insertOne: async (doc: any) => ((calls.insert = doc), { insertedId: OID }),
  findOneAndUpdate: async (_filter: any, update: any) => ((calls.update = update), null),
  deleteOne: async () => ({ deletedCount: 1 }),
  countDocuments: async () => 0,
  bulkWrite: async (ops: any[]) => ((calls.bulk = ops), { matchedCount: ops.length, modifiedCount: ops.length }),
}
const fakeDb = { collection: () => collection }
const fakeClient = { db: () => fakeDb } as unknown as MongoClient

let authResult: NextResponse | null = null
let authThrows = false
const requireAdmin = async () => {
  if (authThrows) throw new Error('session lookup failed')
  return authResult
}
configureAdminKit({ clientPromise: Promise.resolve(fakeClient), requireAdmin, dbName: 'test' })
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

beforeEach(() => {
  admin()
  authThrows = false
  calls = {}
  findOneResult = null
})

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
    await PATCH(req('/api/widgets', 'PATCH', { name: 'a', _id: OID }))
    expect(calls.update.$set.name).toBe('a')
    // qty was omitted from the body, so it must be absent from $set rather than
    // overwritten with null/0 (the pre-fix behaviour clobbered omitted fields).
    expect('qty' in calls.update.$set).toBe(false)
  })
  it('PATCH writes (and coerces) the fields that ARE present', async () => {
    await PATCH(req('/api/widgets', 'PATCH', { name: 'a', qty: '7', _id: OID }))
    expect(calls.update.$set.name).toBe('a')
    expect(calls.update.$set.qty).toBe(7)
    expect(typeof calls.update.$set.qty).toBe('number')
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

  it('the default sort breaks createdAt ties by _id', async () => {
    await GET(req('/api/widgets'))
    expect(calls.sort).toEqual({ createdAt: -1, _id: -1 })
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
  it('mapRead gets the read context, not the array index', async () => {
    const seen: unknown[] = []
    const r = defineResource({ name: 'r4', label: 'R4', list: { public: true }, fields: [] })
    const { GET } = crud({ ...r, hooks: { mapRead: (doc, ctx) => (seen.push(ctx), doc) } })
    notAdmin()
    await GET(req('/api/r4'))
    expect(seen).toEqual([{ isAdmin: false }, { isAdmin: false }])
  })
})

describe('crud — date fields are server-managed by default', () => {
  const posts = defineResource({
    name: 'posts',
    label: 'Post',
    fields: [
      { name: 'title', type: 'text', required: true },
      { name: 'createdAt', type: 'date' },
      { name: 'publishedAt', type: 'date' },
    ],
  })
  const { POST, PATCH } = crud(posts)

  it('PATCH never writes the round-tripped date string over the stored Date', async () => {
    await PATCH(req('/api/posts', 'PATCH', { _id: OID, title: 't', createdAt: '2024-01-01T00:00:00.000Z', publishedAt: '' }))
    expect(calls.update.$set).not.toHaveProperty('createdAt')
    expect(calls.update.$set).not.toHaveProperty('publishedAt')
    expect(calls.update.$set.updatedAt).toBeInstanceOf(Date)
  })

  it('POST stores no "" for a date field and stamps createdAt itself', async () => {
    await POST(req('/api/posts', 'POST', { title: 't', createdAt: '', publishedAt: '' }))
    expect(calls.insert).not.toHaveProperty('publishedAt')
    expect(calls.insert.createdAt).toBeInstanceOf(Date)
  })

  it('a date field with persist: true is stored as a Date ("" clears it, junk is skipped)', async () => {
    const events = defineResource({
      name: 'events',
      label: 'Event',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'startsAt', type: 'date', persist: true },
        { name: 'endsAt', type: 'date', persist: true },
        { name: 'remindAt', type: 'date', persist: true },
      ],
    })
    await crud(events).PATCH(
      req('/api/events', 'PATCH', { _id: OID, title: 't', startsAt: '2026-05-01T10:00:00.000Z', endsAt: '', remindAt: 'soon' }),
    )
    expect(calls.update.$set.startsAt).toEqual(new Date('2026-05-01T10:00:00.000Z'))
    expect(calls.update.$set.endsAt).toBeNull()
    expect(calls.update.$set).not.toHaveProperty('remindAt')
  })

  it('_id / createdAt / updatedAt are never taken from the body, whatever the field type', async () => {
    const odd = defineResource({
      name: 'odd',
      label: 'Odd',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'createdAt', type: 'text' },
        { name: 'updatedAt', type: 'text' },
      ],
    })
    await crud(odd).PATCH(req('/api/odd', 'PATCH', { _id: OID, title: 't', createdAt: 'x', updatedAt: 'y' }))
    expect(calls.update.$set).not.toHaveProperty('createdAt')
    expect(calls.update.$set.updatedAt).toBeInstanceOf(Date)
  })
})

describe('crud — number fields', () => {
  const items = defineResource({
    name: 'items',
    label: 'Item',
    fields: [
      { name: 'name', type: 'text', required: true },
      { name: 'discount', type: 'number', emptyAsNull: true },
      { name: 'rating', type: 'number', min: 1, max: 5 },
      { name: 'price', type: 'number', step: 0.01 },
    ],
  })
  const { POST } = crud(items)

  it('emptyAsNull stores null, not 0', async () => {
    expect((await POST(req('/api/items', 'POST', { name: 'x', discount: null }))).status).toBe(200)
    expect(calls.insert.discount).toBeNull()
  })
  it('max is enforced, with a readable message', async () => {
    const res = await POST(req('/api/items', 'POST', { name: 'x', rating: 99 }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('Rating must be at most 5')
  })
  it('min is enforced', async () => {
    expect((await POST(req('/api/items', 'POST', { name: 'x', rating: 0 }))).status).toBe(400)
  })
  it('step is enforced (19.99 ok, 19.999 rejected)', async () => {
    expect((await POST(req('/api/items', 'POST', { name: 'x', price: 19.99 }))).status).toBe(200)
    expect((await POST(req('/api/items', 'POST', { name: 'x', price: 19.999 }))).status).toBe(400)
  })
  it('only numeric strings are coerced ("", true and [] are rejected)', async () => {
    for (const price of ['', true, []]) {
      expect((await POST(req('/api/items', 'POST', { name: 'x', price }))).status).toBe(400)
    }
  })
})

describe('crud — optional enumValidated select', () => {
  const tagged = defineResource({
    name: 'tagged',
    label: 'Tagged',
    fields: [
      { name: 'name', type: 'text', required: true },
      { name: 'cat', type: 'select', enumValidated: true, options: [{ value: '', label: 'None' }, 'a', 'b'] },
    ],
  })
  const { POST } = crud(tagged)
  it('may be omitted or left empty, but not set to an unlisted value', async () => {
    expect((await POST(req('/api/tagged', 'POST', { name: 'x' }))).status).toBe(200)
    expect((await POST(req('/api/tagged', 'POST', { name: 'x', cat: '' }))).status).toBe(200)
    expect((await POST(req('/api/tagged', 'POST', { name: 'x', cat: 'zzz' }))).status).toBe(400)
  })
})

describe('crud — admin-aware public reads', () => {
  const blogs = defineResource({
    name: 'blogs',
    label: 'Blog',
    list: {
      public: true,
      byId: true,
      paginate: true,
      filter: (_sp, { isAdmin }) => (isAdmin ? {} : { status: 'published' }),
    },
    fields: [{ name: 'title', type: 'text' }],
  })
  const { GET } = crud(blogs)

  it('the public view is filtered and capped at MAX_PAGE_LIMIT', async () => {
    notAdmin()
    await GET(req('/api/blogs'))
    expect(calls.find).toEqual({ status: 'published' })
    expect(calls.limit).toBe(100)
  })
  it('an admin with no limit (the admin table) gets every row, unfiltered', async () => {
    admin()
    await GET(req('/api/blogs'))
    expect(calls.find).toEqual({})
    expect(calls.limit).toBeUndefined()
  })
  it('an explicit limit is honoured for everyone', async () => {
    admin()
    await GET(req('/api/blogs?limit=5&offset=10'))
    expect(calls.limit).toBe(5)
    expect(calls.skip).toBe(10)
  })
  it('?id= lookups apply the filter, so a hidden row is not reachable by id', async () => {
    notAdmin()
    const res = await GET(req(`/api/blogs?id=${OID}`))
    expect(res.status).toBe(404)
    expect(calls.findOne).toMatchObject({ status: 'published' })
    expect(String(calls.findOne._id)).toBe(OID)
  })
  it('an admin ?id= lookup is unfiltered', async () => {
    admin()
    findOneResult = { _id: OID, title: 'draft' }
    expect((await GET(req(`/api/blogs?id=${OID}`))).status).toBe(200)
    expect(Object.keys(calls.findOne)).toEqual(['_id'])
  })
  it('a failing admin check reads as the public view, not an error', async () => {
    authThrows = true
    expect((await GET(req('/api/blogs'))).status).toBe(200)
    expect(calls.find).toEqual({ status: 'published' })
    expect(calls.limit).toBe(100)
  })
  it('a non-public resource passes isAdmin: true to its filter', async () => {
    const seen: ReadContext[] = []
    const inbox = defineResource({ name: 'inbox', label: 'Inbox', list: { filter: (_sp, ctx) => (seen.push(ctx), {}) }, fields: [] })
    await crud(inbox).GET(req('/api/inbox'))
    expect(seen).toEqual([{ isAdmin: true }])
  })
})

describe('reorder — list.orderField', () => {
  const ranked = defineResource({
    name: 'ranked',
    label: 'Ranked',
    list: { public: true, orderField: 'position' },
    fields: [{ name: 'name', type: 'text' }],
  })
  const { POST } = reorder(ranked)

  it('requires admin', async () => {
    notAdmin()
    expect((await POST(req('/api/ranked/reorder', 'POST', { ids: [OID] }))).status).toBe(401)
  })

  it('writes a dense 0..n-1 sequence to the order field in submitted order', async () => {
    const res = await POST(req('/api/ranked/reorder', 'POST', { ids: [OID2, OID, OID3] }))
    expect(res.status).toBe(200)
    expect(calls.bulk).toHaveLength(3)
    expect(calls.bulk.map((o: any) => o.updateOne.update.$set.position)).toEqual([0, 1, 2])
    expect(calls.bulk.map((o: any) => String(o.updateOne.filter._id))).toEqual([OID2, OID, OID3])
    // every write also bumps updatedAt
    expect(calls.bulk[0].updateOne.update.$set.updatedAt).toBeInstanceOf(Date)
  })

  it('400 when the resource has no orderField', async () => {
    const plain = defineResource({ name: 'plain2', label: 'Plain2', list: { public: true }, fields: [] })
    const res = await reorder(plain).POST(req('/api/plain2/reorder', 'POST', { ids: [OID] }))
    expect(res.status).toBe(400)
  })

  it('400 on empty / missing ids', async () => {
    expect((await POST(req('/api/ranked/reorder', 'POST', { ids: [] }))).status).toBe(400)
    expect((await POST(req('/api/ranked/reorder', 'POST', {}))).status).toBe(400)
  })

  it('400 on an invalid ObjectId in the list', async () => {
    expect((await POST(req('/api/ranked/reorder', 'POST', { ids: [OID, 'nope'] }))).status).toBe(400)
  })

  it('400 on duplicate ids', async () => {
    expect((await POST(req('/api/ranked/reorder', 'POST', { ids: [OID, OID] }))).status).toBe(400)
  })

  it('GET sorts by the order field, ties broken by _id', async () => {
    await crud(ranked).GET(req('/api/ranked'))
    expect(calls.sort).toEqual({ position: 1, _id: 1 })
  })
})

describe('createAdminKit — handlers bound to their own config', () => {
  const ranked = defineResource({ name: 'ranked', label: 'Ranked', list: { orderField: 'position' }, fields: [] })

  it('uses its own getClient (per request) and requireAdmin, not the global config', async () => {
    let connects = 0
    let allow = false
    const kit = createAdminKit({
      getClient: async () => {
        connects += 1
        if (connects === 1) throw new Error('transient: server selection timed out')
        return fakeClient
      },
      requireAdmin: async () => (allow ? null : NextResponse.json({ error: 'no' }, { status: 401 })),
    })
    const { GET } = kit.crud(ranked)

    expect((await GET(req('/api/ranked'))).status).toBe(401) // its own check, though the global one allows
    allow = true
    expect((await GET(req('/api/ranked'))).status).toBe(500) // the one failed connect...
    expect((await GET(req('/api/ranked'))).status).toBe(200) // ...is retried on the next request
    expect((await kit.reorder(ranked).POST(req('/api/ranked/reorder', 'POST', { ids: [OID] }))).status).toBe(200)
  })

  it('refuses an incomplete config up front', () => {
    expect(() => createAdminKit({ requireAdmin: async () => null })).toThrow(/getClient/)
  })
})

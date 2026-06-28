import { describe, it, expect, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'
import type { MongoClient } from 'mongodb'
import { configureAdminKit } from './config'
import { crud } from './crud'
import { defineResource } from './resource'

const OID = '507f1f77bcf86cd799439011'

/* eslint-disable @typescript-eslint/no-explicit-any */
const cursor: any = { sort: () => cursor, skip: () => cursor, limit: () => cursor, toArray: async () => [] }
const collection = {
  find: () => cursor,
  findOne: async () => null,
  insertOne: async () => ({ insertedId: OID }),
  findOneAndUpdate: async () => null,
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
  it('POST happy -> 200 with _id + body', async () => {
    const res = await POST(req('/api/widgets', 'POST', { name: 'a', qty: 1 }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json._id).toBe(OID)
    expect(json.name).toBe('a')
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

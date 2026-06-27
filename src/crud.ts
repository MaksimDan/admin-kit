import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { getClientPromise, getDbName, requireAdmin } from './config'
import { parseJsonBody, validate, parsePagination, invalidObjectIdResponse } from './validation'
import type { DefinedResource } from './resource'

// The generic GET/POST/PATCH/DELETE factory. crud(resource) returns Next.js route
// handlers: requireAdmin on mutations, validate-before-id ordering, createdAt/
// updatedAt stamping, pagination, and per-entity quirks via hooks (mapRead /
// buildWrite / mapCreateResponse / customPatch). The Mongo client and the admin
// check come from configureAdminKit() (see config.ts).

export function crud(r: DefinedResource) {
  const getDb = async () => (await getClientPromise()).db(getDbName())
  const getCol = async () => (await getDb()).collection(r.collection ?? r.name)
  const persistKeys = r.fields.filter((f) => f.persist !== false).map((f) => f.name)
  const pickSet = (body: Record<string, unknown>): Record<string, unknown> =>
    Object.fromEntries(persistKeys.map((k) => [k, body[k]]))

  async function GET(req: Request) {
    try {
      if (r.list?.public === false) {
        const authError = await requireAdmin()
        if (authError) return authError
      }
      const sp = new URL(req.url).searchParams
      const col = await getCol()

      if (r.list?.byId && sp.get('id')) {
        const id = sp.get('id')
        const idError = invalidObjectIdResponse(id)
        if (idError) return idError
        const doc = await col.findOne({ _id: new ObjectId(id!) })
        if (!doc) return NextResponse.json({ error: `${r.label} not found` }, { status: 404 })
        return NextResponse.json(r.hooks?.mapRead ? r.hooks.mapRead(doc) : doc)
      }

      let cursor = col.find(r.list?.filter ? r.list.filter(sp) : {})
      if (r.list?.sort !== null) cursor = cursor.sort(r.list?.sort ?? { createdAt: -1 })
      if (r.list?.paginate) {
        const { limit, offset } = parsePagination(sp)
        if (offset) cursor = cursor.skip(offset)
        if (limit) cursor = cursor.limit(limit)
      }
      const docs = await cursor.toArray()
      return NextResponse.json(r.hooks?.mapRead ? docs.map(r.hooks.mapRead) : docs)
    } catch (error) {
      console.error(`Error fetching ${r.name}:`, error)
      return NextResponse.json({ error: `Error fetching ${r.name}` }, { status: 500 })
    }
  }

  async function POST(req: Request) {
    const authError = await requireAdmin()
    if (authError) return authError
    try {
      const { data, error: bodyError } = await parseJsonBody(req)
      if (bodyError) return bodyError
      const body = data as Record<string, unknown>

      const { error: validationError } = validate(r.schema, body)
      if (validationError) return validationError

      const col = await getCol()
      const defaults = pickSet(body)
      let setDoc: Record<string, unknown>
      if (r.hooks?.buildWrite) {
        const patch = await r.hooks.buildWrite({ mode: 'create', body, existing: null, defaults, db: await getDb() })
        if (patch instanceof NextResponse) return patch
        setDoc = patch.set
      } else {
        setDoc = defaults
      }

      const now = new Date()
      const toInsert = { ...setDoc, createdAt: now, updatedAt: now }
      const result = await col.insertOne(toInsert)

      const responseBody = r.hooks?.mapCreateResponse
        ? r.hooks.mapCreateResponse({ insertedId: result.insertedId, body, doc: toInsert })
        : { _id: result.insertedId, ...body, createdAt: new Date(), updatedAt: new Date() }
      return NextResponse.json(responseBody)
    } catch (error) {
      console.error(`Error creating ${r.name}:`, error)
      return NextResponse.json({ error: `Error creating ${r.name}` }, { status: 500 })
    }
  }

  async function PATCH(req: Request) {
    if (r.hooks?.customPatch) return r.hooks.customPatch(req)

    const authError = await requireAdmin()
    if (authError) return authError
    try {
      const { data, error: bodyError } = await parseJsonBody(req)
      if (bodyError) return bodyError
      const body = data as Record<string, unknown> & { _id?: string }

      const { error: validationError } = validate(r.schema, body)
      if (validationError) return validationError
      const idError = invalidObjectIdResponse(body._id)
      if (idError) return idError

      const col = await getCol()
      const _id = new ObjectId(body._id!)
      const defaults = pickSet(body)

      let setDoc: Record<string, unknown>
      let unset: string[] | undefined
      if (r.hooks?.buildWrite) {
        const existing = await col.findOne({ _id })
        const patch = await r.hooks.buildWrite({ mode: 'update', body, existing, defaults, db: await getDb() })
        if (patch instanceof NextResponse) return patch
        setDoc = patch.set
        unset = patch.unset
      } else {
        setDoc = defaults
      }

      const update: Record<string, unknown> = { $set: { ...setDoc, updatedAt: new Date() } }
      if (unset && unset.length) update.$unset = Object.fromEntries(unset.map((k) => [k, '']))

      const updated = await col.findOneAndUpdate({ _id }, update, { returnDocument: 'after' })
      if (!updated) return NextResponse.json({ error: `${r.label} not found` }, { status: 404 })
      return NextResponse.json(updated)
    } catch (error) {
      console.error(`Error updating ${r.name}:`, error)
      return NextResponse.json({ error: `Error updating ${r.name}` }, { status: 500 })
    }
  }

  async function DELETE(req: Request) {
    const authError = await requireAdmin()
    if (authError) return authError
    try {
      const { searchParams } = new URL(req.url)
      const id = searchParams.get('id')
      const idError = invalidObjectIdResponse(id)
      if (idError) return idError

      const col = await getCol()
      const result = await col.deleteOne({ _id: new ObjectId(id!) })
      if (result.deletedCount === 0) {
        return NextResponse.json({ error: `${r.label} not found` }, { status: 404 })
      }
      return NextResponse.json({ success: true })
    } catch (error) {
      console.error(`Error deleting ${r.name}:`, error)
      return NextResponse.json({ error: `Error deleting ${r.name}` }, { status: 500 })
    }
  }

  return { GET, POST, PATCH, DELETE }
}

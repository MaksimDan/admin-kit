import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { getClientPromise, getDbName, requireAdmin } from './config'
import { parseJsonBody, validate, parsePagination, invalidObjectIdResponse, MAX_PAGE_LIMIT } from './validation'
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
  // Build the default $set: only persisted keys actually PRESENT in the raw body
  // (so PATCH is genuinely partial and omitted optionals aren't nulled), taking
  // each value from the parsed/coerced object when present, else the raw body.
  const pickSet = (
    body: Record<string, unknown>,
    parsed?: Record<string, unknown>,
  ): Record<string, unknown> =>
    Object.fromEntries(
      persistKeys
        .filter((k) => k in body)
        .map((k) => [k, parsed && k in parsed ? parsed[k] : body[k]]),
    )

  async function GET(req: Request) {
    try {
      // Secure by default: GET requires admin UNLESS the resource explicitly opts
      // into a public listing with list.public === true.
      if (r.list?.public !== true) {
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
      if (r.list?.sort !== null) {
        const fallbackSort: Record<string, 1 | -1> = r.list?.orderField ? { [r.list.orderField]: 1 } : { createdAt: -1 }
        cursor = cursor.sort(r.list?.sort ?? fallbackSort)
      }
      if (r.list?.paginate) {
        // Default-on cap: a paginated resource can never dump the whole collection,
        // even when the client gives no/invalid limit.
        const { limit, offset } = parsePagination(sp)
        cursor = cursor.skip(offset ?? 0).limit(limit ?? MAX_PAGE_LIMIT)
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

      const { data: parsed, error: validationError } = validate(r.schema, body)
      if (validationError) return validationError

      const col = await getCol()
      const defaults = pickSet(body, parsed as Record<string, unknown>)
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
        : { _id: result.insertedId, ...toInsert }
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

      const { data: parsed, error: validationError } = validate(r.schema, body)
      if (validationError) return validationError
      const idError = invalidObjectIdResponse(body._id)
      if (idError) return idError

      const col = await getCol()
      const _id = new ObjectId(body._id!)
      const defaults = pickSet(body, parsed as Record<string, unknown>)

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

// Sanity bound on a single reorder call — far above any real curated list. Reorder
// rewrites a DENSE 0..n-1 sequence, so the whole (unpaginated) list is expected in
// one request; this only guards against a malformed/abusive payload.
const MAX_REORDER = 5000

// Reorder route factory for resources that declare list.orderField. The admin
// table (ResourceTable) POSTs the full ordered list of _ids after a drag or an
// up/down move; we write a dense 0..n-1 sequence to the order field in a single
// bulkWrite. Dense reassignment keeps positions unique and gap-free with no manual
// number entry and no uniqueness collisions to resolve. Mount at
// /api/{name}/reorder:  export const { POST } = reorder(myResource)
export function reorder(r: DefinedResource) {
  const orderField = r.list?.orderField
  const getCol = async () => (await getClientPromise()).db(getDbName()).collection(r.collection ?? r.name)

  async function POST(req: Request) {
    const authError = await requireAdmin()
    if (authError) return authError
    if (!orderField) {
      return NextResponse.json({ error: `Reorder is not enabled for ${r.name}: set list.orderField.` }, { status: 400 })
    }
    try {
      const { data, error: bodyError } = await parseJsonBody(req)
      if (bodyError) return bodyError
      const ids = (data as { ids?: unknown } | null)?.ids
      if (!Array.isArray(ids) || ids.length === 0) {
        return NextResponse.json({ error: 'Body must be { ids: string[] } with at least one id.' }, { status: 400 })
      }
      if (ids.length > MAX_REORDER) {
        return NextResponse.json({ error: `Cannot reorder more than ${MAX_REORDER} rows at once.` }, { status: 400 })
      }
      for (const id of ids) {
        const idError = invalidObjectIdResponse(typeof id === 'string' ? id : null)
        if (idError) return idError
      }
      if (new Set(ids as string[]).size !== ids.length) {
        return NextResponse.json({ error: 'Duplicate ids in the reorder payload.' }, { status: 400 })
      }

      const now = new Date()
      const col = await getCol()
      const ops = (ids as string[]).map((id, index) => ({
        updateOne: {
          filter: { _id: new ObjectId(id) },
          update: { $set: { [orderField]: index, updatedAt: now } },
        },
      }))
      const result = await col.bulkWrite(ops, { ordered: false })
      return NextResponse.json({ success: true, matched: result.matchedCount, modified: result.modifiedCount })
    } catch (error) {
      console.error(`Error reordering ${r.name}:`, error)
      return NextResponse.json({ error: `Error reordering ${r.name}` }, { status: 500 })
    }
  }

  return { POST }
}

import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { bindRuntime, globalRuntime, type AdminKitConfig, type KitRuntime } from './config'
import { parseJsonBody, validate, parsePagination, invalidObjectIdResponse, MAX_PAGE_LIMIT } from './validation'
import type { DefinedResource, ReadContext } from './resource'
import type { Field } from './field'

// The generic GET/POST/PATCH/DELETE factory. crud(resource) returns Next.js route
// handlers: requireAdmin on mutations, validate-before-id ordering, createdAt/
// updatedAt stamping, pagination, and per-entity quirks via hooks (mapRead /
// buildWrite / mapCreateResponse / customPatch). The Mongo client and the admin
// check come from createAdminKit() or configureAdminKit() (see config.ts).

// Keys crud() manages itself; never written from a request body.
const RESERVED_KEYS = new Set(['_id', 'createdAt', 'updatedAt'])

// Date fields are server-managed by default (e.g. createdAt shown in the table),
// so they are only written from the body when the field sets persist: true.
const isPersisted = (f: Field): boolean => !RESERVED_KEYS.has(f.name) && (f.persist ?? f.type !== 'date')

const has = (obj: Record<string, unknown>, key: string): boolean => Object.prototype.hasOwnProperty.call(obj, key)

// A persisted date arrives as the ISO string the form round-tripped: store a
// real Date ('' or null clears it). undefined = unparseable, leave it unwritten.
function toDate(value: unknown): Date | null | undefined {
  if (value instanceof Date) return value
  if (value === null || value === '') return null
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? undefined : d
  }
  return undefined
}

function makeCrud(r: DefinedResource, kit: KitRuntime) {
  const getCol = async () => (await kit.getDb()).collection(r.collection ?? r.name)
  const persisted = r.fields.filter(isPersisted)
  // Build the default $set: only persisted keys actually PRESENT in the raw body
  // (so PATCH is genuinely partial and omitted optionals aren't nulled), taking
  // each value from the parsed/coerced object when present, else the raw body.
  const pickSet = (body: Record<string, unknown>, parsed?: Record<string, unknown>): Record<string, unknown> => {
    const set: Record<string, unknown> = {}
    for (const f of persisted) {
      if (!has(body, f.name)) continue
      const value = parsed && has(parsed, f.name) ? parsed[f.name] : body[f.name]
      if (f.type !== 'date') {
        set[f.name] = value
        continue
      }
      const date = toDate(value)
      if (date !== undefined) set[f.name] = date
    }
    return set
  }

  // On a public resource, being an admin only changes the view (filter, mapRead,
  // the page cap), so an auth error just means "not an admin".
  async function callerIsAdmin(): Promise<boolean> {
    try {
      return (await kit.requireAdmin()) === null
    } catch (error) {
      console.error(`Admin check failed while reading ${r.name}:`, error)
      return false
    }
  }

  async function GET(req: Request) {
    try {
      // Secure by default: GET requires admin UNLESS the resource explicitly opts
      // into a public listing with list.public === true.
      let isAdmin = true
      if (r.list?.public === true) {
        isAdmin = await callerIsAdmin()
      } else {
        const authError = await kit.requireAdmin()
        if (authError) return authError
      }
      const ctx: ReadContext = { isAdmin }
      const sp = new URL(req.url).searchParams
      const query = r.list?.filter ? r.list.filter(sp, ctx) : {}
      const mapRead = r.hooks?.mapRead
      const col = await getCol()

      const id = sp.get('id')
      if (r.list?.byId && id) {
        const idError = invalidObjectIdResponse(id)
        if (idError) return idError
        // The filter applies here too, so a row hidden from the list is not
        // reachable by guessing its id.
        const doc = await col.findOne({ ...query, _id: new ObjectId(id) })
        if (!doc) return NextResponse.json({ error: `${r.label} not found` }, { status: 404 })
        return NextResponse.json(mapRead ? mapRead(doc, ctx) : doc)
      }

      let cursor = col.find(query)
      if (r.list?.sort !== null) {
        // _id breaks ties so the order (and therefore paging) is deterministic.
        const fallbackSort: Record<string, 1 | -1> = r.list?.orderField
          ? { [r.list.orderField]: 1, _id: 1 }
          : { createdAt: -1, _id: -1 }
        cursor = cursor.sort(r.list?.sort ?? fallbackSort)
      }
      if (r.list?.paginate) {
        // The page cap keeps a public request from dumping the whole collection;
        // an admin asking for no particular page (the admin table) gets every row.
        const { limit, offset } = parsePagination(sp)
        if (offset) cursor = cursor.skip(offset)
        const pageSize = limit ?? (isAdmin ? undefined : MAX_PAGE_LIMIT)
        if (pageSize !== undefined) cursor = cursor.limit(pageSize)
      }
      const docs = await cursor.toArray()
      return NextResponse.json(mapRead ? docs.map((doc) => mapRead(doc, ctx)) : docs)
    } catch (error) {
      console.error(`Error fetching ${r.name}:`, error)
      return NextResponse.json({ error: `Error fetching ${r.name}` }, { status: 500 })
    }
  }

  async function POST(req: Request) {
    try {
      const authError = await kit.requireAdmin()
      if (authError) return authError
      const { data, error: bodyError } = await parseJsonBody(req)
      if (bodyError) return bodyError
      const body = data as Record<string, unknown>

      const { data: parsed, error: validationError } = validate(r.schema, body)
      if (validationError) return validationError

      const col = await getCol()
      const defaults = pickSet(body, parsed as Record<string, unknown>)
      let setDoc: Record<string, unknown>
      if (r.hooks?.buildWrite) {
        const patch = await r.hooks.buildWrite({ mode: 'create', body, existing: null, defaults, db: await kit.getDb() })
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

    try {
      const authError = await kit.requireAdmin()
      if (authError) return authError
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
        const patch = await r.hooks.buildWrite({ mode: 'update', body, existing, defaults, db: await kit.getDb() })
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
    try {
      const authError = await kit.requireAdmin()
      if (authError) return authError
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
function makeReorder(r: DefinedResource, kit: KitRuntime) {
  const orderField = r.list?.orderField

  async function POST(req: Request) {
    try {
      const authError = await kit.requireAdmin()
      if (authError) return authError
      if (!orderField) {
        return NextResponse.json({ error: `Reorder is not enabled for ${r.name}: set list.orderField.` }, { status: 400 })
      }
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
      const col = (await kit.getDb()).collection(r.collection ?? r.name)
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

// Route handlers bound to the config passed to configureAdminKit(). The config
// is read per request, so the setup module must have run by then — import it
// at the top of every route file.
export const crud = (r: DefinedResource) => makeCrud(r, globalRuntime)
export const reorder = (r: DefinedResource) => makeReorder(r, globalRuntime)

// A kit instance bound to its own config. Export its crud/reorder from your
// setup module and import them in route files: a route then cannot run before
// the kit is configured, whatever the module load order.
export function createAdminKit(config: AdminKitConfig) {
  const kit = bindRuntime(config)
  return {
    crud: (r: DefinedResource) => makeCrud(r, kit),
    reorder: (r: DefinedResource) => makeReorder(r, kit),
  }
}

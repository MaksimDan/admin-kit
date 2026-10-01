import type { Db, ObjectId } from 'mongodb'
import type { NextResponse } from 'next/server'
import type { Field } from './field'
import { toZod } from './field'

// Resource definition types. Server types (Db/ObjectId/NextResponse) are imported
// TYPE-ONLY here, so this module stays client-safe (type imports are erased at
// build). The actual hook IMPLEMENTATIONS that use those values must live in a
// `server-only` module, never in the client-imported config.

export type WritePatch = { set: Record<string, unknown>; unset?: string[] }

export interface WriteCtx {
  mode: 'create' | 'update'
  body: Record<string, unknown>
  existing: Record<string, unknown> | null
  defaults: Record<string, unknown> // the auto-picked $set (persist fields), to spread + override
  db: Db
}

export interface CreateRespCtx {
  insertedId: ObjectId
  body: Record<string, unknown>
  doc: Record<string, unknown>
}

// Who is reading, for list.filter and hooks.mapRead. On a public resource this
// shapes the view (e.g. drafts only for an admin); it never grants access.
export interface ReadContext {
  isAdmin: boolean
}

export interface ListConfig {
  public?: boolean // default false (GET requires admin); true => anyone may GET
  byId?: boolean // default false; true => GET ?id= returns a single doc (still subject to filter)
  sort?: Record<string, 1 | -1> | null // default {createdAt:-1, _id:-1} (or {[orderField]:1, _id:1}); null => no .sort()
  // default false; true => limit/offset paging, capped at MAX_PAGE_LIMIT per page.
  // An admin request without a limit (the admin table) returns every row.
  paginate?: boolean
  // Query applied to the list AND to ?id= lookups. Use ctx.isAdmin to hide rows
  // from the public, e.g. (sp, { isAdmin }) => (isAdmin ? {} : { status: 'published' }).
  filter?: (sp: URLSearchParams, ctx: ReadContext) => Record<string, unknown>
  // When set, the admin table is drag-reorderable and reorder() persists a dense
  // 0..n-1 sequence to this field (mount it at /api/{name}/reorder). Opt-in per
  // resource; pair with a curated list. GET falls back to sorting by this field
  // when sort is unset.
  orderField?: string
}

export interface ResourceHooks {
  mapRead?: (doc: Record<string, unknown>, ctx: ReadContext) => Record<string, unknown>
  // POST & PATCH write builder. Returns the $set/$unset patch, OR a NextResponse
  // to short-circuit (e.g. a duplicate-key 400, a no-change 200, a 404).
  buildWrite?: (ctx: WriteCtx) => WritePatch | NextResponse | Promise<WritePatch | NextResponse>
  mapCreateResponse?: (ctx: CreateRespCtx) => unknown
  customPatch?: (req: Request) => Promise<NextResponse> // fully replaces PATCH, including its own admin check
}

export interface ResourceCard {
  title: string
  description: string
  icon: string // lucide icon name, mapped in ModuleGrid
  colorClass: string // color key (rose/blue/green/purple/orange), mapped in ModuleGrid
  href: string
  cta: string // footer call-to-action text
}

export interface Resource {
  name: string // route segment + default collection + error noun
  label: string // singular, for titles/buttons/labels
  fields: Field[] // declaration order = form order
  collection?: string // default = name
  list?: ListConfig
  hooks?: ResourceHooks
  columns?: string[] // table column order by field name (when it differs from form order)
  card?: ResourceCard // dashboard module-card data
}

export type DefinedResource = Resource & { schema: ReturnType<typeof toZod> }

// Attach the derived Zod schema. The config file calls this; the schema is the
// single source of truth re-exported by apiValidation.
export const defineResource = (r: Resource): DefinedResource => ({ ...r, schema: toZod(r.fields) })

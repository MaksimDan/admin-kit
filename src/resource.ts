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

export interface ListConfig {
  public?: boolean // default true; false => GET requires admin (leads)
  byId?: boolean // default false; true => GET ?id= returns a single doc (vehicles)
  sort?: Record<string, 1 | -1> | null // default {createdAt:-1}; null => no .sort()
  paginate?: boolean // default false; true => apply parsePagination (vehicles/blogs)
  filter?: (sp: URLSearchParams) => Record<string, unknown> // products activeOnly, blogs status=published
}

export interface ResourceHooks {
  mapRead?: (doc: Record<string, unknown>) => Record<string, unknown>
  // POST & PATCH write builder. Returns the $set/$unset patch, OR a NextResponse
  // to short-circuit (e.g. services duplicate-order 400 / no-change 200 / 404).
  buildWrite?: (ctx: WriteCtx) => WritePatch | NextResponse | Promise<WritePatch | NextResponse>
  mapCreateResponse?: (ctx: CreateRespCtx) => unknown
  customPatch?: (req: Request) => Promise<NextResponse> // fully replaces PATCH incl. its own requireAdmin (leads)
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

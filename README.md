# @maksimdan/admin-kit

A config-driven admin panel for **Next.js (App Router) + MongoDB** with a single
env-based admin. Declare each entity as a list of fields; the kit derives the Zod
schema, the CRUD API, the form, the table, and the dashboard card from it.

Built for reuse across small sites: a new site's admin is a `resources.ts`
config + a few one-line wrappers.

## Install

It ships as raw TypeScript (no build step) and is compiled by the consuming app
via `transpilePackages`. Add it as a git dependency:

```jsonc
// package.json
"dependencies": {
  "@maksimdan/admin-kit": "github:MaksimDan/admin-kit#v0.1.0"
}
```

## Integrate (once per site)

1. **`next.config`** — let Next compile the kit:
   ```js
   const nextConfig = { transpilePackages: ['@maksimdan/admin-kit'] }
   ```
2. **`tailwind.config`** — keep the kit's classes:
   ```js
   content: [/* ...your globs... */, './node_modules/@maksimdan/admin-kit/src/**/*.{ts,tsx}']
   ```
3. **Wire the seam** — the kit is datastore/auth-agnostic; give it your Mongo
   client + admin check once (see `template/setup.example.ts`):
   ```ts
   import { configureAdminKit } from '@maksimdan/admin-kit/server'
   import clientPromise from '@/lib/mongodb'
   import { requireAdmin } from '@/lib/auth-middleware'
   configureAdminKit({ clientPromise, requireAdmin, dbName: process.env.MONGODB_DB })
   ```

## Declare entities

```ts
// src/config/resources.ts   (CLIENT-SAFE — no server imports)
import { defineResource } from '@maksimdan/admin-kit'

export const products = defineResource({
  name: 'products', label: 'Product',
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'price', type: 'number', required: true, default: 0 },
    { name: 'status', type: 'select', required: true, enumValidated: true, options: ['active','inactive'], default: 'active' },
  ],
})
```

## Wire each entity (one line each)

```ts
// app/api/products/route.ts
import { crud } from '@maksimdan/admin-kit/server'
import { products } from '@/config/resources'
export const { GET, POST, PATCH, DELETE } = crud(products)
```
```tsx
// app/admin/products/page.tsx
'use client'
import { ResourcePage } from '@maksimdan/admin-kit'
import { products } from '@/config/resources'
export default () => <ResourcePage resource={products} />
```

See `template/` for copy-paste starters (config, setup, route, page).

## Field types

`text · textarea · markdown · number · boolean · select · url · image · images ·
date · custom`. Per-field knobs: `required`/`formRequired`, `options` +
`enumValidated`, `default`, `min/max/step`, `readOnly`, `compute`, `emptyAsNull`,
`fullWidth`, `tableHidden`, `align`, `format`, `badge`, and escape hatches
`zod`/`input`/`cell`.

## Per-entity behavior: hooks (server)

Anything non-generic lives in a **server-only** module (`resources.server.ts`)
and composes onto the client-safe config:

```ts
import type { DefinedResource } from '@maksimdan/admin-kit'
import { vehicles } from './resources'

export const vehiclesResource: DefinedResource = {
  ...vehicles,
  hooks: {
    mapRead,            // transform docs on read
    buildWrite,         // build the $set/$unset (or return a NextResponse to short-circuit)
    mapCreateResponse,  // shape the POST response
    customPatch,        // fully replace PATCH (owns its own auth)
  },
}
```

## Entry points

- `@maksimdan/admin-kit` — client-safe: `defineResource`, field model, `ResourcePage`,
  `ResourceForm`, `ResourceTable`, `ModuleGrid`, UI primitives, image helpers.
- `@maksimdan/admin-kit/server` — server: `crud`, `configureAdminKit`, request helpers.

## The host contract

The kit expects the host to provide, via `configureAdminKit`:
- a MongoDB `clientPromise`
- a `requireAdmin(): Promise<NextResponse | null>` (401 when not admin)

Everything else (auth setup, the `[...nextauth]` mount, route/layout/page files,
env, Tailwind) stays in the app — Next can't package route segments.

## Peer dependencies

`react` ≥19 · `react-dom` ≥19 · `next` ≥15 · `next-auth` ≥4 · `mongodb` ≥6 ·
`zod` ≥3.23 · `lucide-react` ≥0.4

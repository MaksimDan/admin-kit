# @maksimdan/admin-kit

A config-driven admin panel for **Next.js (App Router) + MongoDB** with a single
env-based admin. Declare each entity as a list of fields; the kit derives the Zod
schema, the CRUD API, the form, the table, and the dashboard card from it.

Built for reuse across small sites: a new site's admin is a `resources.ts`
config + a few one-line wrappers.

## Install

It ships as raw TypeScript (no build step) and is compiled by the consuming app
via `transpilePackages`. Pin it to a **content-addressed HTTPS tarball** by commit
SHA:

```jsonc
// package.json
"dependencies": {
  "@maksimdan/admin-kit": "https://github.com/MaksimDan/admin-kit/archive/COMMIT_SHA.tar.gz"
}
```

Replace `COMMIT_SHA` with the full 40-char SHA of the commit you want — the latest
commit on `main`, or the commit a release tag points at.

**Why a SHA tarball and not `github:MaksimDan/admin-kit#v0.1.0`?** npm rewrites
`github:owner/repo#ref` into a `git+ssh://` URL, which needs an SSH key. Vercel and
most CI runners don't have one, so the install fails — this caused a real
production build outage. The HTTPS `archive/<sha>.tar.gz` URL is **keyless** (plain
HTTPS, no SSH or credentials) and **content-addressed**: a given SHA always
resolves to the same bytes, so the install is cache-safe and byte-for-byte
identical on your laptop, in CI, and on Vercel.

**Upgrading:** bump the SHA in the URL to a newer commit and reinstall. Because the
URL is content-addressed, npm only refetches when the SHA changes.

## Consumer requirements

The kit ships raw TypeScript and is compiled by **your** app, so your project's
config has to be able to build it:

- **`tsconfig.json`** — `moduleResolution: "bundler"` (or `"node16"` / `"nodenext"`)
  so the subpath exports (`/server`, `/image`, `/mongo`) resolve, plus
  `"jsx": "preserve"`, `"strict": true`, and `"skipLibCheck": true`.
- **`next.config`** — `transpilePackages: ['@maksimdan/admin-kit']` so Next compiles
  the kit's TS. The admin table renders thumbnails unoptimized, so it needs no
  `remotePatterns`. Add `placehold.co` only if your own pages render
  `PLACEHOLDER_IMAGE` through `next/image`:
  ```js
  const nextConfig = {
    transpilePackages: ['@maksimdan/admin-kit'],
    images: { remotePatterns: [{ protocol: 'https', hostname: 'placehold.co' }] },
  }
  ```
- **Tailwind** — the kit's components are styled with Tailwind classes your build
  has to generate. Tailwind v3 (`tailwind.config`):
  ```js
  content: [/* ...your globs... */, './node_modules/@maksimdan/admin-kit/src/**/*.{ts,tsx}']
  ```
  Tailwind v4 (your global CSS, path relative to that file):
  ```css
  @source "../node_modules/@maksimdan/admin-kit/src";
  ```

## Environment

| Variable | Used by |
| --- | --- |
| `MONGODB_URI` | `createClientPromise()` |
| `MONGODB_DB` | the database name (or pass `dbName`) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | the single admin's login |
| `AUTHENTICATION_KEY` | the admin's TOTP seed (base32) |
| `NEXTAUTH_SECRET` | next-auth's session encryption |
| `NEXTAUTH_URL` | next-auth's own origin; required off Vercel |

Generate the TOTP seed once and enroll it in an authenticator app:

```ts
import { generateTOTPSecret, totpKeyUri } from '@maksimdan/admin-kit/server'
const secret = generateTOTPSecret() // -> AUTHENTICATION_KEY
totpKeyUri('admin@example.com', 'Example Admin', secret) // otpauth://… — render as a QR code
```

## Integrate (once per site)

1. **Set up auth + the kit** in one server-only module (see
   `template/setup.example.ts`). The route files import `crud`/`reorder` from it,
   so a route can never run before the kit is configured:
   ```ts
   // src/lib/admin-kit-setup.ts
   import { createAdminAuth, createAdminKit } from '@maksimdan/admin-kit/server'
   import { createClientPromise } from '@maksimdan/admin-kit/mongo'

   export const { authOptions, requireAdmin } = createAdminAuth({
     adminEmail: process.env.ADMIN_EMAIL!,
     adminPassword: process.env.ADMIN_PASSWORD!,
     totpSecret: process.env.AUTHENTICATION_KEY!,
     nextAuthSecret: process.env.NEXTAUTH_SECRET!,
   })

   // getClient runs on every request: createClientPromise() reuses one client per
   // process and retries after a failed connect, so one bad cold start doesn't
   // break every later request.
   export const { crud, reorder } = createAdminKit({
     getClient: createClientPromise,
     requireAdmin,
     dbName: process.env.MONGODB_DB,
   })
   ```
   Your own server code should also call `createClientPromise()` per use rather
   than awaiting one promise captured at import time, for the same reason.
2. **Mount NextAuth + the login page** (app-level — Next can't package routes):
   ```tsx
   // app/api/auth/[...nextauth]/route.ts
   import NextAuth from 'next-auth'
   import { authOptions } from '@/lib/admin-kit-setup'
   const handler = NextAuth(authOptions)
   export { handler as GET, handler as POST }

   // app/admin/login/page.tsx
   'use client'
   import { LoginForm } from '@maksimdan/admin-kit'
   export default () => <LoginForm />
   ```
   After signing in, `LoginForm` navigates to `/admin` (or to a same-origin
   `?callbackUrl`); pass `callbackUrl` to change the default. Wrap the app in
   `<SessionProvider>` (next-auth/react) and drop `<SessionCountdown />` (from the
   kit) in your admin header.

## Declare entities

```ts
// src/config/resources.ts   (CLIENT-SAFE — no server imports)
import { defineResource } from '@maksimdan/admin-kit'

export const products = defineResource({
  name: 'products', label: 'Product',
  list: { public: true }, // GET is admin-only unless a resource opts in
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'price', type: 'number', required: true, default: 0, step: 0.01 },
    { name: 'status', type: 'select', required: true, enumValidated: true, options: ['active','inactive'], default: 'active' },
  ],
})
```

## Wire each entity (one line each)

```ts
// app/api/products/route.ts
import { crud } from '@/lib/admin-kit-setup'
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

## List options (`list`)

| Option | Default | Effect |
| --- | --- | --- |
| `public` | `false` | `true` lets anyone `GET`; otherwise `GET` requires the admin. |
| `filter(sp, { isAdmin })` | none | Mongo query for the list **and** `?id=` lookups. Use `isAdmin` to hide rows from the public, e.g. `(sp, { isAdmin }) => (isAdmin ? {} : { status: 'published' })`. |
| `byId` | `false` | `GET ?id=` returns one document (through `filter`). |
| `paginate` | `false` | `?limit=&offset=` paging, at most 100 per page. An admin request with no `limit` (the admin table) gets every row. |
| `sort` | `{ createdAt: -1, _id: -1 }` | `null` skips sorting. |
| `orderField` | none | Drag-reorder in the admin table, persisted as a dense `0..n-1` sequence. Mount the reorder route (below); `GET` then sorts by this field. |

```ts
// app/api/products/reorder/route.ts — needed when list.orderField is set
import { reorder } from '@/lib/admin-kit-setup'
import { products } from '@/config/resources'
export const { POST } = reorder(products)
```

## Field types

`text · textarea · markdown · number · boolean · select · url · image · images ·
date · custom`. Per-field knobs: `required`/`formRequired`, `options` +
`enumValidated`, `default`, `min/max/step`, `readOnly`, `compute`, `emptyAsNull`,
`fullWidth`, `tableHidden`, `align`, `format`, `badge`, and escape hatches
`zod`/`input`/`cell`.

- **number** — `min`/`max`/`step` are checked in the form and enforced by the
  schema. The schema's floor is `0` unless `min` says otherwise. Only numeric
  strings are coerced (`""`, booleans and arrays are rejected). `emptyAsNull`
  stores a cleared input as `null` instead of `0`.
- **select** — `enumValidated` restricts values to `options`; an optional one also
  accepts `''` (its "none" choice).
- **date** — server-managed by default (e.g. `createdAt` shown in the table): no
  form input and never written from a request. Set `persist: true` to accept ISO
  strings, stored as `Date`s.
- **url / image / images** — an http(s) URL or a site-local `/path`
  (protocol-relative `//host` is rejected); blank `images` rows are dropped.
- **custom** — `input(ctx)` receives `{ field, value, setValue, form, setForm, id }`
  (`FieldInputContext`); pair it with `zod` to validate the value.

## Per-entity behavior: hooks (server)

Anything non-generic lives in a **server-only** module (`resources.server.ts`)
and composes onto the client-safe config:

```ts
import type { DefinedResource } from '@maksimdan/admin-kit'
import { vehicles } from './resources'

export const vehiclesResource: DefinedResource = {
  ...vehicles,
  hooks: {
    mapRead,            // transform docs on read: (doc, { isAdmin }) => doc
    buildWrite,         // build the $set/$unset (or return a NextResponse to short-circuit)
    mapCreateResponse,  // shape the POST response
    customPatch,        // fully replace PATCH (owns its own auth)
  },
}
```

## Entry points

- **`@maksimdan/admin-kit`** (`.`) — the **client barrel** (client-safe +
  isomorphic): `defineResource` + the field model, all the admin UI
  (`ResourcePage`, `ResourceForm`, `ResourceTable`, `ModuleGrid`, UI primitives),
  `LoginForm`, `SessionCountdown`, and the image helpers. Import this from client
  components and from your site config.
- **`@maksimdan/admin-kit/server`** (`/server`) — **server only** (pulls in
  `mongodb` / `next/server`): `createAdminKit` (and the legacy `crud`/`reorder` +
  `configureAdminKit`), `createAdminAuth`, `generateTOTPSecret`/`totpKeyUri`, the
  request helpers (`parseJsonBody`, `validate`, `parsePagination`,
  `invalidObjectIdResponse`), and `rateLimit` + `clientIpFromHeaders`. Import only
  from route files and your one-time setup module — never a client component.
- **`@maksimdan/admin-kit/image`** (`/image`) — just the image-URL helpers
  (`getValidImageUrl`, `isValidImageUrl`, `PLACEHOLDER_IMAGE`). Import these in your
  **public / marketing** pages instead of the main barrel, so you don't pull the
  admin UI into public bundles.
- **`@maksimdan/admin-kit/mongo`** (`/mongo`) — `createClientPromise()`, the
  **HMR-safe MongoDB connection singleton** (one client per process; reuses the
  connection across dev hot-reloads; forgets a failed connect so the next call
  retries). Pass the function itself as `getClient`.

## The host contract

The kit provides auth (login + TOTP + absolute session + `requireAdmin`) and the
CRUD/UI. The host provides:
- the single admin's credentials + secrets (env) to `createAdminAuth`
- a MongoDB `getClient` to `createAdminKit`

App-level pieces Next can't package stay in the app: the `[...nextauth]` route
that mounts `authOptions`, `<SessionProvider>`, the route/layout/page files, env,
and Tailwind config. `createAdminAuth` is configurable — pass
`sessionTtlSeconds` to change the 30-minute default.

**Login throttling.** Each client IP gets 10 login attempts a minute. The IP comes
from the first `X-Forwarded-For` entry, which is trustworthy only behind a proxy
that overwrites that header (Vercel does); elsewhere pass
`createAdminAuth({ clientIp: (headers) => … })` reading the header your proxy sets.
Independently, 10 wrong authenticator codes after a correct password lock every
login for 15 minutes, which caps code guessing if the password leaks. These
counters live in process memory, so each server instance keeps its own.

### Legacy: `configureAdminKit`

Sites set up before `createAdminKit` can keep the global form:
`configureAdminKit({ getClient: createClientPromise, requireAdmin, dbName })` in the
setup module and `crud`/`reorder` from `@maksimdan/admin-kit/server` in routes.
The config is read per request, so **every route file must import the setup
module first** (`import '@/lib/admin-kit-setup'`). `clientPromise` is still
accepted in place of `getClient`, but a single promise that rejects stays
rejected until the process restarts.

## Releasing

1. Bump `version` in `package.json` to match the tag you're about to cut.
2. Commit the version bump.
3. `git tag vX.Y.Z` (same version), then `git push origin main --tags`.
4. Consumers upgrade by bumping their tarball SHA (see **Install**) to the new
   commit — usually the one the tag points at.

## Peer dependencies

`react` ≥19 · `react-dom` ≥19 · `next` ≥15 · `next-auth` ^4.24.11 (4.24.12+ for
Next 16) · `mongodb` ≥6 · `zod` ≥3.23 · `lucide-react` ≥0.460 · `otplib` ^12
(otplib 13 removed the API the kit uses)

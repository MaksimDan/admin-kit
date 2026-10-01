import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import type { z } from 'zod'

// Generic request-handling helpers used by crud(). Bundled into the kit (the host
// no longer provides them). Site-specific request SCHEMAS are NOT here — they are
// derived from each resource's fields (see field.ts#toZod).

// Returns a 400 response when `id` is missing or not a valid Mongo ObjectId.
export function invalidObjectIdResponse(id: string | null | undefined): NextResponse | null {
  if (!id || !ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'Invalid or missing id' }, { status: 400 })
  }
  return null
}

// Upper bound on a single page for public list endpoints.
export const MAX_PAGE_LIMIT = 100

// Parses optional limit/offset params. Returns undefined for an absent/invalid
// param (callers then return everything); clamps limit to 1..MAX_PAGE_LIMIT.
export function parsePagination(searchParams: URLSearchParams): { limit?: number; offset?: number } {
  const toInt = (raw: string | null): number | undefined => {
    if (raw === null) return undefined
    const n = Number(raw)
    return Number.isFinite(n) ? Math.floor(n) : undefined
  }
  const rawLimit = toInt(searchParams.get('limit'))
  const rawOffset = toInt(searchParams.get('offset'))
  return {
    limit: rawLimit === undefined ? undefined : Math.min(Math.max(rawLimit, 1), MAX_PAGE_LIMIT),
    offset: rawOffset === undefined ? undefined : Math.max(rawOffset, 0),
  }
}

export const MAX_BODY_BYTES = 1_000_000

const tooLarge = () => ({ error: NextResponse.json({ error: 'Request body too large' }, { status: 413 }) })

// Reads the body as UTF-8, counting bytes as they stream in and stopping at
// maxBytes, so a body without Content-Length can't make us buffer it all
// first. null = over the cap.
async function readBodyText(req: Request, maxBytes: number): Promise<string | null> {
  if (!req.body) return ''
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

// Reads and JSON-parses a request body with a size cap in bytes (413 too large,
// 400 invalid).
export async function parseJsonBody(
  req: Request,
  maxBytes: number = MAX_BODY_BYTES,
): Promise<{ data?: unknown; error?: NextResponse }> {
  const contentLength = req.headers.get('content-length')
  if (contentLength && Number(contentLength) > maxBytes) return tooLarge()
  let text: string | null
  try {
    text = await readBodyText(req, maxBytes)
  } catch {
    return { error: NextResponse.json({ error: 'Unable to read request body' }, { status: 400 }) }
  }
  if (text === null) return tooLarge()
  try {
    return { data: text ? JSON.parse(text) : {} }
  } catch {
    return { error: NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  }
}

// Validates `data` against `schema`; returns a 400 with field details on failure,
// otherwise returns the parsed (coerced/transformed) data so callers can persist it.
export function validate(schema: z.ZodTypeAny, data: unknown): { error?: NextResponse; data?: unknown } {
  const result = schema.safeParse(data)
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
    const summary = details.map((d) => (d.field ? `${d.field}: ${d.message}` : d.message)).join('; ')
    return { error: NextResponse.json({ error: summary || 'Validation failed', details }, { status: 400 }) }
  }
  return { data: result.data }
}

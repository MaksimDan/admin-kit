import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import {
  invalidObjectIdResponse,
  parseJsonBody,
  validate,
  parsePagination,
  MAX_BODY_BYTES,
  MAX_PAGE_LIMIT,
} from './validation'

describe('invalidObjectIdResponse', () => {
  it('null for a valid ObjectId', () => {
    expect(invalidObjectIdResponse('507f1f77bcf86cd799439011')).toBeNull()
  })
  it('400 for missing/malformed', () => {
    const bad: (string | null | undefined)[] = [null, undefined, '', 'nope', '123']
    for (const v of bad) {
      const r = invalidObjectIdResponse(v)
      expect(r).not.toBeNull()
      expect(r?.status).toBe(400)
    }
  })
})

describe('parseJsonBody', () => {
  const makeReq = (body: string, headers: Record<string, string> = {}) =>
    new Request('http://localhost/api', { method: 'POST', body, headers })
  it('parses valid JSON', async () => {
    const { data, error } = await parseJsonBody(makeReq('{"a":1}'))
    expect(error).toBeUndefined()
    expect(data).toEqual({ a: 1 })
  })
  it('empty body -> {}', async () => {
    const { data } = await parseJsonBody(makeReq(''))
    expect(data).toEqual({})
  })
  it('invalid JSON -> 400', async () => {
    const { error } = await parseJsonBody(makeReq('{nope'))
    expect(error?.status).toBe(400)
  })
  it('over the cap -> 413', async () => {
    const { error } = await parseJsonBody(makeReq('{"a":1}'), 3)
    expect(error?.status).toBe(413)
  })
  it('MAX_BODY_BYTES is sane', () => expect(MAX_BODY_BYTES).toBeGreaterThan(1000))
})

describe('validate', () => {
  const schema = z.object({ title: z.string().min(1, 'Title is required') })
  it('passes valid data with no error', () => {
    expect(validate(schema, { title: 'x' }).error).toBeUndefined()
  })
  it('returns 400 with field details on invalid data', async () => {
    const { error } = validate(schema, {})
    expect(error?.status).toBe(400)
    const body = await error?.json()
    expect(typeof body.error).toBe('string')
    expect(Array.isArray(body.details)).toBe(true)
  })
})

describe('parsePagination', () => {
  const sp = (q: string) => new URLSearchParams(q)
  it('absent params -> undefined', () => {
    const r = parsePagination(sp(''))
    expect(r.limit).toBeUndefined()
    expect(r.offset).toBeUndefined()
  })
  it('clamps limit to 1..MAX_PAGE_LIMIT', () => {
    expect(parsePagination(sp('limit=5')).limit).toBe(5)
    expect(parsePagination(sp('limit=0')).limit).toBe(1)
    expect(parsePagination(sp(`limit=${MAX_PAGE_LIMIT + 50}`)).limit).toBe(MAX_PAGE_LIMIT)
  })
  it('offset clamps to >= 0', () => {
    expect(parsePagination(sp('offset=10')).offset).toBe(10)
    expect(parsePagination(sp('offset=-5')).offset).toBe(0)
  })
  it('non-numeric -> undefined', () => {
    expect(parsePagination(sp('limit=abc')).limit).toBeUndefined()
  })
})

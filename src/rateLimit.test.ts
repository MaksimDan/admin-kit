import { describe, it, expect } from 'vitest'
import { rateLimit, clientIpFromHeaders } from './rateLimit'

describe('rateLimit', () => {
  it('allows up to the limit, then blocks with a retry-after', () => {
    const key = 'rl-test-allow-block'
    expect(rateLimit(key, 2, 60_000).allowed).toBe(true)
    expect(rateLimit(key, 2, 60_000).allowed).toBe(true)
    const blocked = rateLimit(key, 2, 60_000)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSec).toBeGreaterThan(0)
  })
  it('tracks keys independently', () => {
    expect(rateLimit('rl-test-x', 1, 60_000).allowed).toBe(true)
    expect(rateLimit('rl-test-y', 1, 60_000).allowed).toBe(true)
  })
})

describe('clientIpFromHeaders', () => {
  it('takes the first x-forwarded-for ip', () => {
    expect(clientIpFromHeaders({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' })).toBe('1.2.3.4')
  })
  it('falls back to x-real-ip', () => {
    expect(clientIpFromHeaders({ 'x-real-ip': '9.9.9.9' })).toBe('9.9.9.9')
  })
  it('returns "unknown" with no headers', () => {
    expect(clientIpFromHeaders(undefined)).toBe('unknown')
  })
  it('accepts a web Headers object', () => {
    expect(clientIpFromHeaders(new Headers({ 'x-forwarded-for': '2.2.2.2' }))).toBe('2.2.2.2')
  })
})

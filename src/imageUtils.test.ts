import { describe, it, expect } from 'vitest'
import { isValidImageUrl, getValidImageUrl, PLACEHOLDER_IMAGE } from './imageUtils'

describe('isValidImageUrl', () => {
  it('accepts empty / null / site path / http(s)', () => {
    const ok: (string | null | undefined)[] = [null, undefined, '', '   ', '/local.png', 'https://x.co/a.png', 'http://x.co/a']
    for (const v of ok) expect(isValidImageUrl(v)).toBe(true)
  })
  it('rejects junk', () => {
    for (const v of ['123', 'foo.png', 'ftp://x/a', 'not a url']) expect(isValidImageUrl(v)).toBe(false)
  })
})

describe('getValidImageUrl', () => {
  it('returns a usable url as-is', () => {
    expect(getValidImageUrl('https://x.co/a.png')).toBe('https://x.co/a.png')
    expect(getValidImageUrl('/local.png')).toBe('/local.png')
  })
  it('falls back for empty / junk', () => {
    expect(getValidImageUrl('')).toBe(PLACEHOLDER_IMAGE)
    expect(getValidImageUrl(undefined)).toBe(PLACEHOLDER_IMAGE)
    expect(getValidImageUrl('123')).toBe(PLACEHOLDER_IMAGE)
  })
  it('honors a custom fallback', () => {
    expect(getValidImageUrl('123', '/fallback.png')).toBe('/fallback.png')
  })
})

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
  it('rejects protocol-relative URLs, which next/image refuses', () => {
    for (const v of ['//evil.example/a.png', ' //evil.example/a.png', '/\\evil.example/a.png']) {
      expect(isValidImageUrl(v)).toBe(false)
    }
  })
})

describe('PLACEHOLDER_IMAGE', () => {
  it('asks placehold.co for PNG (its SVG default is refused by the Next image optimizer)', () => {
    expect(PLACEHOLDER_IMAGE).toMatch(/^https:\/\/placehold\.co\/\d+x\d+\/png\b/)
  })
})

describe('getValidImageUrl', () => {
  it('returns a usable url as-is', () => {
    expect(getValidImageUrl('https://x.co/a.png')).toBe('https://x.co/a.png')
    expect(getValidImageUrl('/local.png')).toBe('/local.png')
  })
  it('falls back for empty / junk / protocol-relative', () => {
    expect(getValidImageUrl('')).toBe(PLACEHOLDER_IMAGE)
    expect(getValidImageUrl(undefined)).toBe(PLACEHOLDER_IMAGE)
    expect(getValidImageUrl('123')).toBe(PLACEHOLDER_IMAGE)
    expect(getValidImageUrl('//evil.example/a.png')).toBe(PLACEHOLDER_IMAGE)
  })
  it('trims a usable URL', () => {
    expect(getValidImageUrl('  /local.png ')).toBe('/local.png')
  })
  it('honors a custom fallback', () => {
    expect(getValidImageUrl('123', '/fallback.png')).toBe('/fallback.png')
  })
})

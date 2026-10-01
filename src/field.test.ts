import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { toZod, capitalize, humanize, nonNegativeNumber, optionalUrl, numberBoundsError } from './field'
import type { Field } from './field'

const s = (fields: Field[]) => toZod(fields)

describe('toZod — schema derivation', () => {
  it('required text: min(1) with "<Name> is required"', () => {
    const schema = s([{ name: 'title', type: 'text', required: true }])
    expect(schema.safeParse({ title: 'x' }).success).toBe(true)
    expect(schema.safeParse({ title: '' }).success).toBe(false)
    expect(schema.safeParse({}).success).toBe(false)
    const r = schema.safeParse({ title: '' })
    if (!r.success) expect(r.error.issues[0].message).toBe('Title is required')
  })

  it('optional text/textarea/markdown allow missing', () => {
    for (const type of ['text', 'textarea', 'markdown'] as const) {
      expect(s([{ name: 'x', type }]).safeParse({}).success).toBe(true)
    }
  })

  it('number: coerces numeric strings, rejects negative/NaN', () => {
    const schema = s([{ name: 'price', type: 'number', required: true }])
    const ok = schema.safeParse({ price: '10' })
    expect(ok.success).toBe(true)
    if (ok.success) expect(ok.data.price).toBe(10)
    expect(schema.safeParse({ price: -1 }).success).toBe(false)
    expect(schema.safeParse({ price: 'abc' }).success).toBe(false)
    expect(schema.safeParse({}).success).toBe(false) // required
    expect(s([{ name: 'q', type: 'number' }]).safeParse({}).success).toBe(true) // optional
  })

  it('number: only numeric strings coerce; "", booleans, arrays and hex are rejected', () => {
    const schema = s([{ name: 'n', type: 'number', required: true }])
    for (const ok of ['10', ' 5 ', '2.5', '1e3', 7]) expect(schema.safeParse({ n: ok }).success).toBe(true)
    for (const bad of ['', '  ', true, [], [7], '0x10', null]) expect(schema.safeParse({ n: bad }).success).toBe(false)
  })

  it('number: min (default 0), max and step are enforced with labelled messages', () => {
    const schema = s([
      { name: 'rating', type: 'number', min: 1, max: 5 },
      { name: 'price', type: 'number', label: 'Price ($)', step: 0.01 },
      { name: 'delta', type: 'number', min: -10 },
    ])
    expect(schema.safeParse({ rating: 3, price: 19.99, delta: -4 }).success).toBe(true)
    const tooHigh = schema.safeParse({ rating: 6 })
    expect(tooHigh.success).toBe(false)
    if (!tooHigh.success) expect(tooHigh.error.issues[0].message).toBe('Rating must be at most 5')
    expect(schema.safeParse({ rating: 0 }).success).toBe(false)
    expect(schema.safeParse({ price: -1 }).success).toBe(false) // floor defaults to 0
    const offStep = schema.safeParse({ price: 19.999 })
    expect(offStep.success).toBe(false)
    if (!offStep.success) expect(offStep.error.issues[0].message).toBe('Price ($) must be in steps of 0.01')
    expect(schema.safeParse({ delta: -11 }).success).toBe(false)
  })

  it('number: emptyAsNull keeps null (unless required)', () => {
    const opt = s([{ name: 'd', type: 'number', emptyAsNull: true }])
    const r = opt.safeParse({ d: null })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.d).toBeNull()
    expect(s([{ name: 'd', type: 'number', emptyAsNull: true, required: true }]).safeParse({ d: null }).success).toBe(false)
    expect(s([{ name: 'd', type: 'number' }]).safeParse({ d: null }).success).toBe(false)
  })

  it('numberBoundsError reports only the bounds a field declares', () => {
    const year: Field = { name: 'year', type: 'number', min: 1900, max: 2027 }
    expect(numberBoundsError(year, 1899)).toBe('Year must be at least 1900')
    expect(numberBoundsError(year, 2030)).toBe('Year must be at most 2027')
    expect(numberBoundsError(year, 2020)).toBeNull()
    expect(numberBoundsError({ name: 'price', type: 'number', step: 0.01 }, 1.005)).toBe('Price must be in steps of 0.01')
    expect(numberBoundsError({ name: 'qty', type: 'number' }, -3)).toBeNull() // no declared min
  })

  it('select: enumValidated -> z.enum; otherwise optional string', () => {
    const enumS = s([{ name: 'status', type: 'select', required: true, enumValidated: true, options: ['active', 'inactive'] }])
    expect(enumS.safeParse({ status: 'active' }).success).toBe(true)
    expect(enumS.safeParse({ status: 'nope' }).success).toBe(false)
    const looseS = s([{ name: 'status', type: 'select', options: ['a', 'b'] }])
    expect(looseS.safeParse({ status: 'anything' }).success).toBe(true) // UI-only restriction
  })

  it('enumValidated drops empty-string option values', () => {
    const schema = s([{ name: 'cat', type: 'select', required: true, enumValidated: true, options: [{ value: '', label: 'Pick' }, 'a'] }])
    expect(schema.safeParse({ cat: 'a' }).success).toBe(true)
    expect(schema.safeParse({ cat: '' }).success).toBe(false)
  })

  it('an optional enumValidated select may be missing or empty, but not unlisted', () => {
    const schema = s([{ name: 'cat', type: 'select', enumValidated: true, options: [{ value: '', label: 'None' }, 'a'] }])
    expect(schema.safeParse({}).success).toBe(true)
    expect(schema.safeParse({ cat: '' }).success).toBe(true)
    expect(schema.safeParse({ cat: 'a' }).success).toBe(true)
    expect(schema.safeParse({ cat: 'b' }).success).toBe(false)
  })

  it('url/image: optionalUrl (empty, site path, http ok; junk rejected) regardless of required', () => {
    const schema = s([{ name: 'imageUrl', type: 'image', required: true }, { name: 'pay', type: 'url' }])
    expect(schema.safeParse({}).success).toBe(true) // required only affects the HTML attr, not the schema
    expect(schema.safeParse({ imageUrl: '' }).success).toBe(true)
    expect(schema.safeParse({ imageUrl: '/local.png' }).success).toBe(true)
    expect(schema.safeParse({ imageUrl: 'https://x.co/a.png' }).success).toBe(true)
    expect(schema.safeParse({ imageUrl: '123' }).success).toBe(false)
  })

  it('images: array of valid urls', () => {
    const schema = s([{ name: 'imageUrls', type: 'images' }])
    expect(schema.safeParse({ imageUrls: ['https://x.co/a.jpg'] }).success).toBe(true)
    expect(schema.safeParse({ imageUrls: ['123'] }).success).toBe(false)
    expect(schema.safeParse({}).success).toBe(true) // optional
  })

  it('boolean optional', () => {
    const schema = s([{ name: 'on', type: 'boolean' }])
    expect(schema.safeParse({ on: true }).success).toBe(true)
    expect(schema.safeParse({}).success).toBe(true)
  })

  it('inSchema:false / date / custom are excluded from the body schema', () => {
    const schema = s([
      { name: 'order', type: 'number', inSchema: false },
      { name: 'createdAt', type: 'date' },
      { name: 'thing', type: 'custom' },
      { name: 'name', type: 'text', required: true },
    ])
    // unknown/excluded keys are ignored; only `name` is enforced
    expect(schema.safeParse({ name: 'x', order: 'not-a-number', thing: {} }).success).toBe(true)
    expect(schema.safeParse({ order: 5 }).success).toBe(false) // name still required
  })

  it('custom with an explicit zod override is enforced', () => {
    const schema = s([{ name: 'tags', type: 'custom', zod: z.array(z.string()).min(1) }])
    expect(schema.safeParse({ tags: ['a'] }).success).toBe(true)
    expect(schema.safeParse({ tags: [] }).success).toBe(false)
  })
})

describe('helpers', () => {
  it('capitalize', () => {
    expect(capitalize('name')).toBe('Name')
    expect(capitalize('')).toBe('')
  })
  it('humanize', () => {
    expect(humanize('imageUrl')).toBe('Image Url')
    expect(humanize('for_parts')).toBe('For parts')
  })
  it('nonNegativeNumber coerces + bounds', () => {
    expect(nonNegativeNumber.safeParse('5').success).toBe(true)
    expect(nonNegativeNumber.safeParse(-1).success).toBe(false)
  })
  it('optionalUrl accepts empty/path/http, rejects junk', () => {
    expect(optionalUrl.safeParse(undefined).success).toBe(true)
    expect(optionalUrl.safeParse('').success).toBe(true)
    expect(optionalUrl.safeParse('/x').success).toBe(true)
    expect(optionalUrl.safeParse('https://x.co').success).toBe(true)
    expect(optionalUrl.safeParse('123').success).toBe(false)
    expect(optionalUrl.safeParse('//evil.example/a.png').success).toBe(false)
  })
})

import { z } from 'zod'
import type { ReactNode } from 'react'
import { isValidImageUrl } from './imageUtils'

// The admin-kit field model. A field is a Mongo doc key + a type + flags, from
// which the kit derives three surfaces: a Zod rule, a form input, and a table
// cell. This module is CLIENT-SAFE — it imports only zod + imageUtils, never
// mongodb/next-server — so the site config (which client pages import) can live
// next to it without pulling server code into the browser bundle.

export type FieldType =
  | 'text'
  | 'textarea'
  | 'markdown'
  | 'number'
  | 'boolean'
  | 'select'
  | 'url'
  | 'image'
  | 'images'
  | 'date'
  | 'custom'

export type SelectOption = string | { value: string; label: string }

// What a custom field's `input` renderer receives.
export interface FieldInputContext {
  field: Field
  value: unknown
  setValue: (value: unknown) => void
  form: Record<string, unknown>
  setForm: (patch: Record<string, unknown>) => void
  id: string // the id the field's <label htmlFor> points at
}

export interface Field {
  // --- core (a simple field is just these) ---
  name: string
  type: FieldType
  label?: string // default humanize(name)
  required?: boolean // text/number/select/markdown: HTML required AND Zod-required. url/image: HTML attr + client gate only (Zod stays optional)
  formRequired?: boolean // HTML required only; Zod stays optional (e.g. paymentUrl)

  // --- select ---
  options?: ReadonlyArray<SelectOption>
  enumValidated?: boolean // true => z.enum (optional selects also accept ''); else z.string().optional() (a UI-only restriction)

  // --- form rendering ---
  placeholder?: string
  rows?: number
  min?: number // number: enforced in the form and the schema; the schema's floor is 0 when unset
  max?: number // number: enforced in the form and the schema
  step?: number // number: value must be min (or 0) plus a whole number of steps
  default?: unknown | (() => unknown)
  readOnly?: boolean
  compute?: (form: Record<string, unknown>) => unknown
  emptyAsNull?: boolean // number: a cleared input is stored as null instead of 0
  help?: string
  fullWidth?: boolean
  formHidden?: boolean // default false, except date fields (server-managed, no input) default true

  // --- persistence / validation ---
  inSchema?: boolean // default true; false => excluded from the derived Zod object (e.g. service.order)
  persist?: boolean // default true, except date fields default false; false => not in the default write $set

  // --- table rendering ---
  tableHidden?: boolean
  align?: 'left' | 'right' | 'center'
  format?: (value: unknown, row: Record<string, unknown>) => ReactNode
  badge?: (value: unknown) => { label: string; className: string }

  // --- escape hatches: override exactly one derived layer ---
  zod?: z.ZodTypeAny
  input?: (ctx: FieldInputContext) => ReactNode
  cell?: (row: Record<string, unknown>) => ReactNode
}

export const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

export const humanize = (s: string): string =>
  s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase())

// Shared Zod builders, moved here from apiValidation so the dependency graph is
// acyclic (apiValidation -> resources -> admin-kit/field -> imageUtils).
// Legacy export: number fields no longer use it (z.coerce turns '', true and []
// into numbers); see numberZod below.
export const nonNegativeNumber = z.coerce.number().finite().nonnegative()

// Numeric strings ("10", "-2.5", "1e3") become numbers; anything else ("", true,
// [], "0x10") is left as-is for z.number() to reject.
const NUMERIC_STRING = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i
const toNumberInput = (v: unknown): unknown =>
  typeof v === 'string' && NUMERIC_STRING.test(v.trim()) ? Number(v) : v

// True when `value` is `base` plus a whole number of `step`s. The tolerance
// absorbs float noise (19.99 / 0.01 = 1998.9999999999998).
const onStep = (value: number, base: number, step: number): boolean => {
  const steps = (value - base) / step
  return Math.abs(steps - Math.round(steps)) < 1e-6
}

// The explicit min/max/step a number field declares, as a user-facing message
// (null when the value satisfies them). The form checks these before submitting;
// numberZod enforces the same rules server-side.
export function numberBoundsError(f: Field, value: unknown): string | null {
  if (typeof value !== 'number') return null
  const label = f.label ?? humanize(f.name)
  if (f.min !== undefined && value < f.min) return `${label} must be at least ${f.min}`
  if (f.max !== undefined && value > f.max) return `${label} must be at most ${f.max}`
  if (f.step !== undefined && f.step > 0 && !onStep(value, f.min ?? 0, f.step)) {
    return `${label} must be in steps of ${f.step}`
  }
  return null
}

function numberZod(f: Field): z.ZodTypeAny {
  const label = f.label ?? humanize(f.name)
  const min = f.min ?? 0
  let n = z.number({ message: `${label} must be a number` }).finite().min(min, `${label} must be at least ${min}`)
  if (f.max !== undefined) n = n.max(f.max, `${label} must be at most ${f.max}`)
  const step = f.step
  const checked =
    step !== undefined && step > 0 ? n.refine((v) => onStep(v, min, step), `${label} must be in steps of ${step}`) : n
  const value = z.preprocess(toNumberInput, f.emptyAsNull && !f.required ? checked.nullable() : checked)
  return f.required ? value : value.optional()
}

// Optional URL field: empty, a site-local "/path", or a valid http(s) URL.
export const optionalUrl = z
  .string()
  .optional()
  .refine((v) => isValidImageUrl(v), {
    message: 'Must be a valid URL (http:// or https://) or left empty',
  })

export const optionValues = (options?: ReadonlyArray<SelectOption>): string[] =>
  (options ?? []).map((o) => (typeof o === 'string' ? o : o.value))

// Derive a single field's Zod rule from its type + flags. Returns null for
// fields that are not part of the validated body (custom without an explicit
// schema, inSchema:false, server-managed dates).
function fieldZod(f: Field): z.ZodTypeAny | null {
  if (f.zod) return f.zod
  if (f.inSchema === false || f.type === 'date' || f.type === 'custom') return null

  switch (f.type) {
    case 'text':
    case 'textarea':
    case 'markdown':
      return f.required
        ? z.string().min(1, `${capitalize(f.name)} is required`)
        : z.string().optional()
    case 'number':
      return numberZod(f)
    case 'boolean':
      return z.boolean().optional()
    case 'select': {
      const vals = optionValues(f.options).filter((v) => v !== '')
      if (f.enumValidated && vals.length > 0) {
        const allowed = z.enum(vals as [string, ...string[]])
        // An optional select may be left empty ('' is its "none" option).
        return f.required ? allowed : z.union([allowed, z.literal('')]).optional()
      }
      return z.string().optional()
    }
    case 'url':
    case 'image':
      return optionalUrl
    case 'images':
      return z
        .array(z.string().refine(isValidImageUrl, { message: 'Each image must be a valid URL' }))
        .optional()
    default:
      return null
  }
}

// Build the Zod object schema for a resource from its fields, in declaration
// order. Fields that aren't part of the validated body are skipped.
export function toZod(fields: Field[]) {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const f of fields) {
    const rule = fieldZod(f)
    if (rule) shape[f.name] = rule
  }
  return z.object(shape)
}

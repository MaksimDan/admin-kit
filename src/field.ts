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

export interface Field {
  // --- core (a simple field is just these) ---
  name: string
  type: FieldType
  label?: string // default humanize(name)
  required?: boolean // text/number/select/markdown: HTML required AND Zod-required. url/image: HTML attr + client gate only (Zod stays optional)
  formRequired?: boolean // HTML required only; Zod stays optional (e.g. paymentUrl)

  // --- select ---
  options?: ReadonlyArray<SelectOption>
  enumValidated?: boolean // true => z.enum (product/blog status); else z.string().optional() (vehicle status, product category — UI-only restriction)

  // --- form rendering ---
  placeholder?: string
  rows?: number
  min?: number
  max?: number
  step?: number
  default?: unknown | (() => unknown)
  readOnly?: boolean
  compute?: (form: Record<string, unknown>) => unknown
  emptyAsNull?: boolean
  help?: string
  fullWidth?: boolean
  formHidden?: boolean

  // --- persistence / validation ---
  inSchema?: boolean // default true; false => excluded from the derived Zod object (e.g. service.order)
  persist?: boolean // default true; false => not in the default write $set

  // --- table rendering ---
  tableHidden?: boolean
  align?: 'left' | 'right' | 'center'
  format?: (value: unknown, row: Record<string, unknown>) => ReactNode
  badge?: (value: unknown) => { label: string; className: string }

  // --- escape hatches: override exactly one derived layer ---
  zod?: z.ZodTypeAny
  input?: (ctx: unknown) => ReactNode
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
export const nonNegativeNumber = z.coerce.number().finite().nonnegative()

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
      return f.required ? nonNegativeNumber : nonNegativeNumber.optional()
    case 'boolean':
      return z.boolean().optional()
    case 'select': {
      const vals = optionValues(f.options).filter((v) => v !== '')
      if (f.enumValidated && vals.length > 0) {
        return z.enum(vals as [string, ...string[]])
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

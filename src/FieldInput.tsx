'use client'

import { useState } from 'react'
import { PlusIcon, TrashIcon } from 'lucide-react'
import type { Field } from './field'
import { humanize } from './field'

const BASE =
  'mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm'

interface Props {
  field: Field
  value: unknown
  onChange: (value: unknown) => void
  form: Record<string, unknown>
  setForm: (patch: Record<string, unknown>) => void
}

// Dynamic add/remove list of free-text image URLs (the 'images' field type).
function ImageUrlList({ value, onChange, label }: { value: string[]; onChange: (v: string[]) => void; label?: string }) {
  const list = value.length ? value : ['']
  const set = (i: number, v: string) => onChange(list.map((u, idx) => (idx === i ? v : u)))
  const add = () => onChange([...list, ''])
  const remove = (i: number) => onChange(list.filter((_, idx) => idx !== i).length ? list.filter((_, idx) => idx !== i) : [''])
  return (
    <div className="mt-1 space-y-2">
      {list.map((url, i) => (
        <div key={i} className="flex gap-2">
          <input
            type="text"
            value={url}
            placeholder="https://..."
            aria-label={`${label ?? 'Image'} URL ${i + 1}`}
            onChange={(e) => set(i, e.target.value)}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
          />
          <button type="button" onClick={() => remove(i)} aria-label="Remove image" className="px-2 text-red-600 hover:text-red-800">
            <TrashIcon className="h-5 w-5" />
          </button>
        </div>
      ))}
      <button type="button" onClick={add} className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800">
        <PlusIcon className="h-4 w-4" /> Add image
      </button>
    </div>
  )
}

// Controlled numeric input. A native <input type="number"> sanitizes any
// intermediate value the user types ('-', '1.', '1e') to '' before React's
// onChange can read it, which made it impossible to type negatives/decimals or
// to clear the field (parseFloat('') -> NaN was snapped to 0). Instead we keep
// the user's RAW STRING in local state while editing, mirror the parent value
// when idle, and commit only a finite parsed number upstream — never snapping
// in-progress input to 0. Rendered as type="text" + inputMode="decimal" so the
// raw keystrokes survive; name/id/min/max/step/readOnly are preserved.
function NumberInput({ field, value, onChange }: { field: Field; value: unknown; onChange: (value: unknown) => void }) {
  const required = !!(field.required || field.formRequired)
  const toStr = (v: unknown) => (v === null || v === undefined || v === '' ? '' : String(v))
  const [raw, setRaw] = useState<string>(() => toStr(value))
  const [editing, setEditing] = useState(false)

  const handleChange = (next: string) => {
    setRaw(next)
    if (next === '') return onChange(field.emptyAsNull ? null : 0)
    const n = parseFloat(next)
    if (Number.isFinite(n)) onChange(n)
    // else: intermediate input ('-', '1.', '1e') — hold the raw string, don't
    // commit, and never snap to 0.
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      id={field.name}
      name={field.name}
      required={required}
      min={field.min}
      max={field.max}
      step={field.step}
      readOnly={field.readOnly}
      value={editing ? raw : toStr(value)}
      onFocus={() => {
        setRaw(toStr(value))
        setEditing(true)
      }}
      onBlur={() => setEditing(false)}
      onChange={(e) => handleChange(e.target.value)}
      className={BASE + (field.readOnly ? ' bg-gray-100' : '')}
    />
  )
}

// Renders the right form control for a field's type. The input always carries
// name={field.name} so existing selectors (and the API body shape) are preserved.
export function FieldInput({ field, value, onChange, form, setForm }: Props) {
  const required = !!(field.required || field.formRequired)

  if (field.type === 'custom' && field.input) {
    return <>{field.input({ field, value, setValue: onChange, form, setForm, id: field.name })}</>
  }

  switch (field.type) {
    case 'text':
    case 'image': // free-text URL field (not a file picker), matching the current forms
      return (
        <input type="text" id={field.name} name={field.name} required={required}
          value={(value as string) ?? ''} placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)} className={BASE} />
      )
    case 'url':
      return (
        <input type="url" id={field.name} name={field.name} required={required}
          value={(value as string) ?? ''} placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)} className={BASE} />
      )
    case 'number':
      return <NumberInput field={field} value={value} onChange={onChange} />
    case 'textarea':
    case 'markdown':
      return (
        <textarea id={field.name} name={field.name} required={required}
          rows={field.rows ?? (field.type === 'markdown' ? 15 : 4)} placeholder={field.placeholder}
          value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)}
          className={BASE + (field.type === 'markdown' ? ' font-mono text-sm' : '')} />
      )
    case 'boolean':
      return (
        <div className="mt-1">
          <input type="checkbox" id={field.name} name={field.name}
            checked={!!value} onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
        </div>
      )
    case 'select': {
      const opts = (field.options ?? []).map((o) =>
        typeof o === 'string' ? { value: o, label: humanize(o) } : o,
      )
      return (
        <select id={field.name} name={field.name} required={required}
          value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} className={BASE}>
          {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )
    }
    case 'images':
      return <ImageUrlList value={(value as string[]) ?? ['']} onChange={onChange} label={field.label ?? humanize(field.name)} />
    default:
      return null
  }
}

// Re-export so consumers can build a controlled list if they need the same widget.
export { ImageUrlList }

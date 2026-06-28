'use client'

import { useState, type FormEvent } from 'react'
import type { DefinedResource } from './resource'
import type { Field } from './field'
import { humanize, optionValues } from './field'
import { isValidImageUrl } from './imageUtils'
import { FieldInput } from './FieldInput'

type Row = Record<string, unknown>

function resolveDefault(field: Field): unknown {
  if (field.default !== undefined) {
    return typeof field.default === 'function' ? (field.default as () => unknown)() : field.default
  }
  switch (field.type) {
    case 'number':
      return 0
    case 'boolean':
      return false
    case 'images':
      return ['']
    case 'select': {
      // A required select left at '' would display its first option (browser
      // default) while state holds '' — a controlled/display mismatch. Seed the
      // first non-empty option so state matches what the user is shown.
      if (field.required || field.formRequired) {
        return optionValues(field.options).find((v) => v !== '') ?? ''
      }
      return ''
    }
    default:
      return ''
  }
}

// Config-driven 2-col form. Seeds defaults (so required selects like status are
// pre-filled), recomputes computed fields, and runs the same client URL gate the
// hand-written forms had before submitting.
export function ResourceForm({
  resource,
  initialData,
  onSubmit,
  onCancel,
}: {
  resource: DefinedResource
  initialData?: Row
  onSubmit: (data: Row) => void
  onCancel: () => void
}) {
  const formFields = resource.fields.filter((f) => !f.formHidden)
  const [form, setForm] = useState<Row>(() => {
    const init: Row = {}
    for (const f of formFields) init[f.name] = initialData?.[f.name] ?? resolveDefault(f)
    return init
  })

  const setValue = (name: string, value: unknown) => {
    setForm((prev) => {
      const next = { ...prev, [name]: value }
      for (const f of formFields) if (f.compute) next[f.name] = f.compute(next)
      return next
    })
  }
  const patchForm = (patch: Row) => setForm((prev) => ({ ...prev, ...patch }))

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    // Client URL gate (matches the current forms): url/image/images must be a
    // valid URL or empty.
    for (const f of formFields) {
      if (f.type === 'url' || f.type === 'image') {
        if (!isValidImageUrl((form[f.name] as string) ?? '')) {
          alert(`${f.label ?? humanize(f.name)} must be a valid URL (http:// or https://) or left empty.`)
          return
        }
      }
      if (f.type === 'images') {
        const arr = (form[f.name] as string[]) ?? []
        if (arr.some((u) => u && !isValidImageUrl(u))) {
          alert('Each image must be a valid URL (http:// or https://) or left empty.')
          return
        }
      }
    }
    const out: Row = { ...form }
    for (const f of formFields) if (f.compute) out[f.name] = f.compute(out)
    onSubmit(out)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {formFields.map((f) => {
          const labelText = f.label ?? humanize(f.name)
          const control = (
            <>
              <FieldInput field={f} value={form[f.name]} onChange={(v) => setValue(f.name, v)} form={form} setForm={patchForm} />
              {f.help && <p className="mt-1 text-xs text-gray-500">{f.help}</p>}
            </>
          )
          return (
            <div key={f.name} className={f.fullWidth ? 'md:col-span-2' : ''}>
              {f.type === 'images' ? (
                // A multi-input field has no single control to bind a <label> to,
                // so name the whole group with a <fieldset>/<legend>.
                <fieldset className="m-0 min-w-0 border-0 p-0">
                  <legend className="block text-sm font-medium text-gray-700">{labelText}</legend>
                  {control}
                </fieldset>
              ) : (
                <>
                  <label htmlFor={f.name} className="block text-sm font-medium text-gray-700">
                    {labelText}
                  </label>
                  {control}
                </>
              )}
            </div>
          )
        })}
      </div>
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
          Cancel
        </button>
        <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
          {initialData ? `Update ${resource.label}` : `Create ${resource.label}`}
        </button>
      </div>
    </form>
  )
}

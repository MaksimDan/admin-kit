'use client'

import Image from 'next/image'
import { ExternalLinkIcon } from 'lucide-react'
import type { Field } from './field'
import { getValidImageUrl } from './imageUtils'

// Renders a table cell for a field. Per-field overrides win (cell > format >
// badge), then a sensible default per type.
export function FieldCell({ field, row }: { field: Field; row: Record<string, unknown> }) {
  if (field.cell) return <>{field.cell(row)}</>
  const value = row[field.name]
  if (field.format) return <>{field.format(value, row)}</>
  if (field.badge) {
    const b = field.badge(value)
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${b.className}`}>
        {b.label}
      </span>
    )
  }

  switch (field.type) {
    case 'image':
      return (
        <div className="relative h-12 w-12">
          <Image src={getValidImageUrl(value as string)} alt="" fill className="rounded-md object-cover" />
        </div>
      )
    case 'images': {
      const arr = (value as string[]) ?? []
      return (
        <div className="relative h-12 w-12">
          <Image src={getValidImageUrl(arr[0])} alt="" fill className="rounded-md object-cover" />
        </div>
      )
    }
    case 'url':
      return value ? (
        <a href={value as string} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-blue-600 hover:text-blue-800">
          <ExternalLinkIcon className="h-4 w-4" />
        </a>
      ) : (
        <span className="text-gray-400">N/A</span>
      )
    case 'boolean':
      return <span>{value ? 'Yes' : 'No'}</span>
    case 'number':
      return <span>{value === undefined || value === null ? 'N/A' : String(value)}</span>
    case 'select':
      return <span>{value ? String(value) : '—'}</span>
    default: {
      const s = value === undefined || value === null || value === '' ? '—' : String(value)
      return <span className="text-sm text-gray-600">{s.length > 80 ? `${s.slice(0, 80)}…` : s}</span>
    }
  }
}

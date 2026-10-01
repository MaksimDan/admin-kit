'use client'

import { useState } from 'react'
import Image from 'next/image'
import { ExternalLinkIcon, ImageOffIcon } from 'lucide-react'
import type { Field } from './field'
import { getValidImageUrl } from './imageUtils'

// A 48px table thumbnail. Unoptimized: admins paste URLs from any host, and the
// optimizer only fetches hosts listed in images.remotePatterns (in dev an
// unlisted host throws and takes the whole table down). A missing, junk or
// unloadable URL shows an inline placeholder, so no image host is needed for it.
function Thumb({ url }: { url: unknown }) {
  const src = getValidImageUrl(typeof url === 'string' ? url : '', '')
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  return (
    <div className="relative h-12 w-12 overflow-hidden rounded-md bg-gray-100">
      {src && failedSrc !== src ? (
        <Image src={src} alt="" fill unoptimized className="object-cover" onError={() => setFailedSrc(src)} />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-gray-400">
          <ImageOffIcon className="h-5 w-5" aria-hidden="true" />
        </div>
      )}
    </div>
  )
}

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
      return <Thumb url={value} />
    case 'images':
      return <Thumb url={Array.isArray(value) ? value[0] : undefined} />
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

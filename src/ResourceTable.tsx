'use client'

import { PencilIcon, TrashIcon } from 'lucide-react'
import type { DefinedResource } from './resource'
import type { Field } from './field'
import { humanize } from './field'
import { FieldCell } from './FieldCell'

type Row = Record<string, unknown>

// Config-driven table: columns in resource.columns order (else field order minus
// tableHidden) plus an Actions column. Edit/Delete button titles are derived from
// the label ("Delete product"), matching the existing accessible names.
export function ResourceTable({
  resource,
  rows,
  onEdit,
  onDelete,
}: {
  resource: DefinedResource
  rows: Row[]
  onEdit: (row: Row) => void
  onDelete: (row: Row) => void
}) {
  const byName = new Map(resource.fields.map((f) => [f.name, f]))
  const columnNames = resource.columns ?? resource.fields.filter((f) => !f.tableHidden).map((f) => f.name)
  const columns = columnNames.map((n) => byName.get(n)).filter((f): f is Field => Boolean(f))
  const labelLower = resource.label.toLowerCase()

  return (
    <div className="bg-white rounded-lg shadow-md overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50">
            {columns.map((f) => (
              <th key={f.name} className="px-4 py-3 text-left">{f.label ?? humanize(f.name)}</th>
            ))}
            <th className="px-4 py-3 text-center">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {rows.map((row) => (
            <tr key={String(row._id)} className="hover:bg-gray-50">
              {columns.map((f) => (
                <td
                  key={f.name}
                  className={`px-4 py-4 ${f.align === 'right' ? 'text-right' : f.align === 'center' ? 'text-center' : 'text-left'}`}
                >
                  <FieldCell field={f} row={row} />
                </td>
              ))}
              <td className="px-4 py-4">
                <div className="flex justify-center gap-2">
                  <button onClick={() => onEdit(row)} className="p-1 text-blue-600 hover:text-blue-800 transition-colors" title={`Edit ${labelLower}`}>
                    <PencilIcon className="h-5 w-5" />
                  </button>
                  <button onClick={() => onDelete(row)} className="p-1 text-red-600 hover:text-red-800 transition-colors" title={`Delete ${labelLower}`}>
                    <TrashIcon className="h-5 w-5" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

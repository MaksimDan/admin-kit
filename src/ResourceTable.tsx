'use client'

import { useState } from 'react'
import { PencilIcon, TrashIcon, GripVerticalIcon, ChevronUpIcon, ChevronDownIcon } from 'lucide-react'
import type { DefinedResource } from './resource'
import type { Field } from './field'
import { humanize } from './field'
import { FieldCell } from './FieldCell'

type Row = Record<string, unknown>

// Config-driven table: columns in resource.columns order (else field order minus
// tableHidden) plus an Actions column. Edit/Delete button titles are derived from
// the label ("Delete product"), matching the existing accessible names.
//
// When the resource declares list.orderField AND an onReorder callback is given,
// a leading reorder column appears: drag a row, or use its up/down buttons
// (keyboard/touch-friendly). Either way we hand the parent the full new _id order;
// it persists a dense sequence via /api/{name}/reorder. Without orderField the
// table renders exactly as before.
export function ResourceTable({
  resource,
  rows,
  onEdit,
  onDelete,
  onReorder,
}: {
  resource: DefinedResource
  rows: Row[]
  onEdit: (row: Row) => void
  onDelete: (row: Row) => void
  onReorder?: (orderedIds: string[]) => void
}) {
  const byName = new Map(resource.fields.map((f) => [f.name, f]))
  const columnNames = resource.columns ?? resource.fields.filter((f) => !f.tableHidden).map((f) => f.name)
  const columns = columnNames.map((n) => byName.get(n)).filter((f): f is Field => Boolean(f))
  const labelLower = resource.label.toLowerCase()

  const reorderable = Boolean(resource.list?.orderField && onReorder)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  // Splice the row out of `from` and back in at `to`, then hand the parent the new
  // _id order. Used by both drag-drop and the up/down buttons.
  const move = (from: number, to: number) => {
    if (!onReorder || from === to || to < 0 || to >= rows.length) return
    const ids = rows.map((r) => String(r._id))
    const [moved] = ids.splice(from, 1)
    ids.splice(to, 0, moved)
    onReorder(ids)
  }

  const clearDrag = () => {
    setDragIndex(null)
    setOverIndex(null)
  }

  return (
    <div className="bg-white rounded-lg shadow-md overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50">
            {reorderable && <th className="w-10 px-2 py-3" aria-label="Reorder" />}
            {columns.map((f) => (
              <th key={f.name} className="px-4 py-3 text-left">{f.label ?? humanize(f.name)}</th>
            ))}
            <th className="px-4 py-3 text-center">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {rows.map((row, index) => {
            const dropAbove = reorderable && dragIndex !== null && overIndex === index && dragIndex > index
            const dropBelow = reorderable && dragIndex !== null && overIndex === index && dragIndex < index
            return (
              <tr
                key={String(row._id)}
                className={`hover:bg-gray-50 ${dragIndex === index ? 'opacity-40' : ''} ${
                  dropAbove ? 'border-t-2 border-indigo-400' : dropBelow ? 'border-b-2 border-indigo-400' : ''
                }`}
                draggable={reorderable || undefined}
                onDragStart={reorderable ? () => setDragIndex(index) : undefined}
                onDragOver={
                  reorderable
                    ? (e) => {
                        e.preventDefault()
                        setOverIndex(index)
                      }
                    : undefined
                }
                onDrop={
                  reorderable
                    ? (e) => {
                        e.preventDefault()
                        if (dragIndex !== null) move(dragIndex, index)
                        clearDrag()
                      }
                    : undefined
                }
                onDragEnd={reorderable ? clearDrag : undefined}
              >
                {reorderable && (
                  <td className="px-2 py-4">
                    <div className="flex items-center gap-1 text-gray-400">
                      <span
                        className="cursor-grab active:cursor-grabbing"
                        title={`Drag to reorder ${labelLower}`}
                        aria-hidden
                      >
                        <GripVerticalIcon className="h-5 w-5" />
                      </span>
                      <div className="flex flex-col">
                        <button
                          type="button"
                          onClick={() => move(index, index - 1)}
                          disabled={index === 0}
                          title={`Move ${labelLower} up`}
                          aria-label={`Move ${labelLower} up`}
                          className="transition-colors hover:text-gray-700 disabled:opacity-30"
                        >
                          <ChevronUpIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => move(index, index + 1)}
                          disabled={index === rows.length - 1}
                          title={`Move ${labelLower} down`}
                          aria-label={`Move ${labelLower} down`}
                          className="transition-colors hover:text-gray-700 disabled:opacity-30"
                        >
                          <ChevronDownIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </td>
                )}
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
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

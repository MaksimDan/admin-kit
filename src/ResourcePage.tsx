'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import type { DefinedResource } from './resource'
import { AdminGate } from './ui/AdminGate'
import { AdminPageHeader } from './ui/AdminPageHeader'
import { EmptyState } from './ui/EmptyState'
import { ModalShell } from './ui/ModalShell'
import { DeleteConfirmationModal } from './ui/DeleteConfirmationModal'
import { ResourceTable } from './ResourceTable'
import { ResourceForm } from './ResourceForm'

type Row = Record<string, unknown>

// The generic admin page: list -> create/edit modal -> delete confirm, wired to
// /api/{name}. All user-facing strings are derived from the resource's name/label
// so they match the hand-written pages exactly.
export function ResourcePage({ resource }: { resource: DefinedResource }) {
  const { data: session } = useSession()
  const [rows, setRows] = useState<Row[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selected, setSelected] = useState<Row | undefined>()
  const [toDelete, setToDelete] = useState<Row | null>(null)
  const endpoint = `/api/${resource.name}`

  const fetchRows = useCallback(async () => {
    try {
      const res = await fetch(endpoint)
      if (!res.ok) throw new Error(`Failed to fetch ${resource.name}`)
      setRows(await res.json())
    } catch (error) {
      console.error(`Error fetching ${resource.name}:`, error)
    } finally {
      setIsLoading(false)
    }
  }, [endpoint, resource.name])

  useEffect(() => {
    fetchRows()
  }, [fetchRows])

  const handleAddNew = () => {
    setSelected(undefined)
    setIsModalOpen(true)
  }
  const handleEdit = (row: Row) => {
    setSelected(row)
    setIsModalOpen(true)
  }
  const closeModal = () => {
    setIsModalOpen(false)
    setSelected(undefined)
  }

  const handleSubmit = async (data: Row) => {
    try {
      const method = selected ? 'PATCH' : 'POST'
      const body = selected ? { ...data, _id: selected._id } : data
      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Failed to save ${resource.label.toLowerCase()}`)
      }
      await fetchRows()
      closeModal()
    } catch (error) {
      console.error(`Error saving ${resource.name}:`, error)
      alert(error instanceof Error ? error.message : 'An error occurred')
    }
  }

  const handleDeleteConfirm = async () => {
    if (!toDelete?._id) return
    try {
      const res = await fetch(`${endpoint}?id=${encodeURIComponent(String(toDelete._id))}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Failed to delete ${resource.label.toLowerCase()}`)
      }
      await fetchRows()
      setToDelete(null)
    } catch (error) {
      console.error(`Error deleting ${resource.name}:`, error)
      alert(error instanceof Error ? error.message : 'An error occurred')
    }
  }

  return (
    <AdminGate session={session} isLoading={isLoading}>
      <div className="space-y-8">
        <AdminPageHeader title={`${resource.label} Management`} buttonLabel={`Add New ${resource.label}`} onAdd={handleAddNew} />

        {rows.length === 0 ? (
          <EmptyState
            message={`No ${resource.name} found`}
            actionLabel={`Add your first ${resource.label.toLowerCase()}`}
            onAction={handleAddNew}
          />
        ) : (
          <ResourceTable resource={resource} rows={rows} onEdit={handleEdit} onDelete={setToDelete} />
        )}

        <ModalShell isOpen={isModalOpen} onClose={closeModal} title={selected ? `Edit ${resource.label}` : `Add New ${resource.label}`}>
          <ResourceForm resource={resource} initialData={selected} onSubmit={handleSubmit} onCancel={closeModal} />
        </ModalShell>

        <DeleteConfirmationModal
          isOpen={toDelete !== null}
          onClose={() => setToDelete(null)}
          onConfirm={handleDeleteConfirm}
          title={`Delete ${resource.label}`}
          message={`Are you sure you want to delete this ${resource.label.toLowerCase()}? This action cannot be undone.`}
        />
      </div>
    </AdminGate>
  )
}

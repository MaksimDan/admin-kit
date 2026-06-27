'use client'

import { useId } from 'react'
import { X } from 'lucide-react'
import { useFocusTrap } from './useFocusTrap'

interface ModalShellProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}

// Shared chrome for admin entity modals: overlay, panel, title, and close
// button. Provides modal accessibility — labelled dialog role, focus trap,
// Escape-to-close, and focus restore — via useFocusTrap.
export const ModalShell = ({ isOpen, onClose, title, children }: ModalShellProps) => {
  const titleId = useId()
  const containerRef = useFocusTrap<HTMLDivElement>(isOpen, onClose)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-end justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={onClose}
        />

        {/* Modal panel */}
        <div
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full sm:p-6 focus:outline-none"
        >
          <div className="flex items-center justify-between mb-5">
            <h3 id={titleId} className="text-lg font-medium leading-6 text-gray-900">
              {title}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500"
              aria-label="Close"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {children}
        </div>
      </div>
    </div>
  )
}

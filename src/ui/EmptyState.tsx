'use client'

interface EmptyStateProps {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

// Shared empty-state card with an optional call-to-action for admin pages.
export const EmptyState = ({ message, actionLabel, onAction }: EmptyStateProps) => (
  <div className="text-center py-12 bg-white rounded-lg shadow">
    <div className="text-gray-500">{message}</div>
    {actionLabel && onAction && (
      <button
        onClick={onAction}
        className="mt-4 text-indigo-600 hover:text-indigo-800"
      >
        {actionLabel}
      </button>
    )}
  </div>
);

'use client'

import { PlusIcon } from 'lucide-react';

interface AdminPageHeaderProps {
  title: string;
  buttonLabel?: string;
  onAdd?: () => void;
}

// Shared "<Title> ... [Add New]" header row for admin management pages. The
// action button is optional (e.g. the Leads page has no "add").
export const AdminPageHeader = ({ title, buttonLabel, onAdd }: AdminPageHeaderProps) => (
  <div className="flex justify-between items-center">
    <h1 className="text-2xl font-bold">{title}</h1>
    {buttonLabel && onAdd && (
      <button
        onClick={onAdd}
        className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors"
      >
        <PlusIcon className="h-5 w-5" />
        {buttonLabel}
      </button>
    )}
  </div>
);

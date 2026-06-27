'use client'

import { useRouter } from 'next/navigation'
import { Inbox, Wrench, Car, BookOpen, ShoppingBag, type LucideIcon } from 'lucide-react'
import type { ResourceCard } from './resource'

// Icon + color maps. Full class strings are listed statically so Tailwind's
// purge keeps them (dynamic `bg-${x}-100` would be stripped).
const ICONS: Record<string, LucideIcon> = { Inbox, Wrench, Car, BookOpen, ShoppingBag }

const COLORS: Record<string, { box: string; icon: string; cta: string }> = {
  rose: { box: 'bg-rose-100 group-hover:bg-rose-200', icon: 'text-rose-600', cta: 'text-rose-600 group-hover:text-rose-700' },
  blue: { box: 'bg-blue-100 group-hover:bg-blue-200', icon: 'text-blue-600', cta: 'text-blue-600 group-hover:text-blue-700' },
  green: { box: 'bg-green-100 group-hover:bg-green-200', icon: 'text-green-600', cta: 'text-green-600 group-hover:text-green-700' },
  purple: { box: 'bg-purple-100 group-hover:bg-purple-200', icon: 'text-purple-600', cta: 'text-purple-600 group-hover:text-purple-700' },
  orange: { box: 'bg-orange-100 group-hover:bg-orange-200', icon: 'text-orange-600', cta: 'text-orange-600 group-hover:text-orange-700' },
}

// Data-driven dashboard card grid. A site's dashboard renders
// <ModuleGrid modules={allResources.map(r => r.card)} />.
export function ModuleGrid({ modules }: { modules: ResourceCard[] }) {
  const router = useRouter()
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {modules.map((m) => {
        const Icon = ICONS[m.icon] ?? Inbox
        const c = COLORS[m.colorClass] ?? COLORS.blue
        return (
          <div
            key={m.href}
            onClick={() => router.push(m.href)}
            className="bg-white shadow rounded-lg p-6 hover:shadow-md transition-shadow cursor-pointer group"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className={`p-3 rounded-lg transition-colors ${c.box}`}>
                <Icon className={`h-6 w-6 ${c.icon}`} />
              </div>
              <h3 className="text-xl font-semibold">{m.title}</h3>
            </div>
            <p className="text-gray-600">{m.description}</p>
            <div className={`mt-4 flex items-center ${c.cta}`}>
              <span>{m.cta}</span>
              <Icon className="ml-2 h-4 w-4" />
            </div>
          </div>
        )
      })}
    </div>
  )
}

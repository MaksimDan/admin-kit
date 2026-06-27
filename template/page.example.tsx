// Copy to: src/app/admin/(dashboard)/products/page.tsx
'use client'
import { ResourcePage } from '@maksimdan/admin-kit'
import { products } from '@/config/resources'

export default function ProductsAdminPage() {
  return <ResourcePage resource={products} />
}

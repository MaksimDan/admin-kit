// Copy to: src/app/api/products/route.ts
// One line per entity. (For entities with hooks, import the composed resource
// from your src/config/resources.server.ts instead of the plain config.)
import { crud } from '@/lib/admin-kit-setup'
import { products } from '@/config/resources'

export const { GET, POST, PATCH, DELETE } = crud(products)

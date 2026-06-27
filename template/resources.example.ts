// Copy to: src/config/resources.ts
// CLIENT-SAFE site config — declare your entities as field lists. The kit derives
// the Zod schema, the form, and the table from these fields.
import { defineResource } from '@maksimdan/admin-kit'

export const products = defineResource({
  name: 'products', // route segment + Mongo collection
  label: 'Product', // singular, used in titles/buttons
  card: {
    title: 'Products',
    description: 'Manage your products.',
    icon: 'ShoppingBag', // lucide name mapped in ModuleGrid
    colorClass: 'orange', // rose | blue | green | purple | orange
    href: '/admin/products',
    cta: 'Manage products',
  },
  fields: [
    { name: 'name', type: 'text', required: true, label: 'Product Name' },
    { name: 'price', type: 'number', required: true, default: 0, align: 'right' },
    {
      name: 'status',
      type: 'select',
      required: true,
      enumValidated: true,
      options: ['active', 'inactive'],
      default: 'active',
    },
    { name: 'imageUrl', type: 'image', tableHidden: true },
    { name: 'description', type: 'textarea', fullWidth: true },
  ],
})

// Dashboard cards, in display order.
export const allResources = [products]

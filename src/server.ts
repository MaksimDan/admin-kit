// Server entry — uses mongodb / next-server. Import only from route files and
// from your one-time setup module. Never from a client component.
import './augment' // ambient next-auth type augmentation (role, expiresAt)

export { crud } from './crud'
export { configureAdminKit } from './config'
export type { RequireAdminFn } from './config'
export { createAdminAuth } from './auth'
export type { AdminAuthConfig, AdminAuth } from './auth'
export {
  parseJsonBody,
  validate,
  parsePagination,
  invalidObjectIdResponse,
  MAX_PAGE_LIMIT,
  MAX_BODY_BYTES,
} from './validation'

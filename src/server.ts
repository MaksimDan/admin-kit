// Server entry — uses mongodb / next-server. Import only from route files and
// from your one-time setup module. Never from a client component.

export { crud } from './crud'
export { configureAdminKit } from './config'
export type { RequireAdminFn } from './config'
export {
  parseJsonBody,
  validate,
  parsePagination,
  invalidObjectIdResponse,
  MAX_PAGE_LIMIT,
  MAX_BODY_BYTES,
} from './validation'

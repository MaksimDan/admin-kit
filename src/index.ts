// Main entry — client-safe + isomorphic. No mongodb / next-server at runtime, so
// it is safe to import from client components and from the site config.
import './augment' // ambient next-auth type augmentation (role, expiresAt)

// Core (field model + resource definition)
export * from './field'
export * from './resource'

// Image URL helpers
export * from './imageUtils'

// Config-driven admin UI
export { FieldInput } from './FieldInput'
export { FieldCell } from './FieldCell'
export { ResourceForm } from './ResourceForm'
export { ResourceTable } from './ResourceTable'
export { ResourcePage } from './ResourcePage'
export { ModuleGrid } from './ModuleGrid'

// Shared admin UI primitives (also reusable on their own)
export { ModalShell } from './ui/ModalShell'
export { DeleteConfirmationModal } from './ui/DeleteConfirmationModal'
export { AdminGate } from './ui/AdminGate'
export { AdminPageHeader } from './ui/AdminPageHeader'
export { EmptyState } from './ui/EmptyState'
export { useFocusTrap } from './ui/useFocusTrap'

// Auth UI (the auth factory itself is server-only — see /server)
export { LoginForm } from './LoginForm'
export { SessionCountdown } from './SessionCountdown'

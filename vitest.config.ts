import { defineConfig } from 'vitest/config'

// The kit's own logic tests run in node (no jsdom): schema derivation, the crud
// factory (via the seam with a fake client), auth callbacks/authorize, validation,
// totp, rate limiting, image utils, and config. React components are covered by a
// consuming app's e2e, not here.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})

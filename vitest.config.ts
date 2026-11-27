import { defineConfig } from 'vitest/config'

// Plain tests of the app's logic (no browser needed): run with `npm test`.
export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
})

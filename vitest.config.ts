import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['core/tests/**/*.spec.ts', 'cli/tests/**/*.spec.ts'],
    globals: false,
    environment: 'node',
  },
})

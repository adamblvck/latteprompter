import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src/renderer')
    }
  },
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      reportsDirectory: 'coverage',
      // Cover the pure logic layers; exclude Electron-only glue and pure-UI/wiring
      // that need a full Electron/DOM runtime to exercise.
      include: [
        'src/shared/**/*.ts',
        'src/renderer/lib/**/*.ts',
        'src/renderer/store/useStore.ts',
        'src/main/services/**/*.ts'
      ],
      exclude: ['**/*.test.ts', 'src/main/services/paths.ts']
    }
  }
})

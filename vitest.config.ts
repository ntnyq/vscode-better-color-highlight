import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '**/.worktrees/**'],
    include: ['tests/**/*.test.ts'],
    server: { deps: { inline: ['reactive-vscode'] } },
    watch: false,
  },
})

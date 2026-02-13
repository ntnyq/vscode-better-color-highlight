import process from 'node:process'
import { defineConfig } from 'tsdown'

const isDev = (): boolean => process.env.NODE_ENV === 'development'

export default defineConfig({
  clean: true,
  deps: {
    neverBundle: ['vscode'],
  },
  dts: {
    tsgo: true,
  },
  entry: ['src/index.ts'],
  minify: !isDev(),
  shims: true,
  sourcemap: isDev(),
  watch: isDev(),
})

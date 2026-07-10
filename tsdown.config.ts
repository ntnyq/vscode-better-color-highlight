import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'tsdown'
import pkg from './package.json' with { type: 'json' }

const isDev = (): boolean => process.env.NODE_ENV === 'development'

export default defineConfig({
  alias: {
    'jsonc-parser': 'jsonc-parser/lib/esm/main.js',
    yaml: fileURLToPath(
      new URL('node_modules/yaml/browser/index.js', import.meta.url),
    ),
  },
  clean: true,
  define: {
    'process.env.NODE_ENV': JSON.stringify(
      isDev() ? 'development' : 'production',
    ),
  },
  deps: {
    alwaysBundle: [...Object.keys(pkg.dependencies), 'tailwindcss/colors'],
    neverBundle: ['vscode'],
    onlyBundle: false,
  },
  dts: false,
  entry: {
    index: 'src/index.ts',
    'web-test': 'tests/e2e/web.ts',
  },
  format: ['esm', 'cjs'],
  minify: !isDev(),
  platform: 'neutral',
  shims: true,
  sourcemap: isDev(),
  watch: isDev(),
})

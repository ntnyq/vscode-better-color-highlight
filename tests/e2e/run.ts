import { resolve } from 'node:path'
import { runTests } from '@vscode/test-electron'

const rootDir = resolve(import.meta.dirname, '../..')

await runTests({
  extensionDevelopmentPath: rootDir,
  extensionTestsPath: resolve(rootDir, 'tests/e2e/suite/index.ts'),
  launchArgs: [resolve(rootDir, 'playground'), '--disable-extensions'],
})

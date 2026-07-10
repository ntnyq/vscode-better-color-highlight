import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { runTests } from '@vscode/test-electron'

const rootDir = resolve(import.meta.dirname, '../..')
const userDataDir = await mkdtemp(
  resolve(tmpdir(), 'better-color-highlight-e2e-'),
)

try {
  await runTests({
    extensionDevelopmentPath: rootDir,
    extensionTestsPath: resolve(rootDir, 'tests/e2e/suite/index.ts'),
    launchArgs: [
      resolve(rootDir, 'playground'),
      '--disable-extensions',
      '--user-data-dir',
      userDataDir,
    ],
  })
} finally {
  await rm(userDataDir, { force: true, recursive: true })
}

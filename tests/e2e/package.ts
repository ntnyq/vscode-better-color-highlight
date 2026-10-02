import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import {
  downloadAndUnzipVSCode,
  resolveCliArgsFromVSCodeExecutablePath,
  runTests,
} from '@vscode/test-electron'

const execute = promisify(execFile)
const rootDir = resolve(import.meta.dirname, '../..')
const temporaryDir = await mkdtemp(join(tmpdir(), 'bch-'))
const extensionsDir = join(temporaryDir, 'extensions')
const userDataDir = join(temporaryDir, 'user-data')
const vsix = join(temporaryDir, 'color-highlight.vsix')

try {
  const packed = await execute('pnpm', ['run', 'pack', '--out', vsix], {
    cwd: rootDir,
  })
  process.stdout.write(packed.stdout)
  const vscodeExecutablePath = await downloadAndUnzipVSCode('stable')
  const [cli, ...cliArgs] =
    resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath)
  const installed = await execute(cli, [
    ...cliArgs,
    '--user-data-dir',
    userDataDir,
    '--extensions-dir',
    extensionsDir,
    '--install-extension',
    vsix,
    '--force',
  ])
  process.stdout.write(installed.stdout)
  const extensionDirectories = await readdir(extensionsDir)
  const directory = extensionDirectories.find(name =>
    name.startsWith('ntnyq.vscode-better-color-highlight-'),
  )
  assert.ok(
    directory,
    'Expected the VSIX to install in the isolated extension directory',
  )
  const installedPath = join(extensionsDir, directory)
  const manifest = JSON.parse(
    await readFile(join(installedPath, 'package.json'), 'utf8'),
  ) as { main: string; browser: string }
  for (const entry of [manifest.main, manifest.browser]) {
    const contents = await readFile(join(installedPath, entry))
    assert.ok(contents.length > 0)
  }
  const runtimeFiles = await readdir(join(installedPath, 'dist'))
  assert.deepEqual(runtimeFiles.sort(), ['index.cjs', 'index.js'])
  // Load the installed distribution so workspace files cannot mask packaging gaps.
  await runTests({
    vscodeExecutablePath,
    extensionDevelopmentPath: installedPath,
    extensionTestsPath: resolve(rootDir, 'tests/e2e/suite/package.ts'),
    launchArgs: [
      '--user-data-dir',
      userDataDir,
      '--extensions-dir',
      extensionsDir,
    ],
  })
  process.stdout.write(
    'Packaged extension installation and activation passed.\n',
  )
} finally {
  await rm(temporaryDir, { force: true, recursive: true })
}

import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { verifyReleaseCommit } from '../../scripts/verify-release'

const execute = promisify(execFile)
let rootDir: string

async function git(...args: string[]): Promise<void> {
  await execute('git', args, { cwd: rootDir })
}

describe('release commit boundary', () => {
  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'bch-release-commit-'))
    await git('init', '--quiet')
    await writeFile(join(rootDir, 'package.json'), '{"version":"0.9.0"}\n')
    await git('add', 'package.json')
    await git(
      '-c',
      'user.name=Release Test',
      '-c',
      'user.email=release@example.test',
      '-c',
      'commit.gpgsign=false',
      '-c',
      `core.hooksPath=${join(rootDir, '.git', 'disabled-hooks')}`,
      'commit',
      '--quiet',
      '-m',
      'test: prepare release',
    )
  })

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true })
  })

  it('accepts a committed release tree', async () => {
    await expect(verifyReleaseCommit(rootDir)).resolves.toBeUndefined()
  })

  it('enforces the commit boundary through the command-line entry', async () => {
    const script = join(import.meta.dirname, '../../scripts/verify-release.ts')
    await expect(
      execute(process.execPath, [script], { cwd: rootDir }),
    ).resolves.toMatchObject({ stderr: '' })
    await writeFile(join(rootDir, 'package.json'), '{"version":"0.10.0"}\n')
    await expect(
      execute(process.execPath, [script], { cwd: rootDir }),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('Commit the complete release changes'),
    })
  })

  it.each(['working', 'staged', 'untracked'])(
    'rejects %s release changes',
    async state => {
      const name = state === 'untracked' ? 'new-feature.ts' : 'package.json'
      await writeFile(join(rootDir, name), '{"version":"0.10.0"}\n')
      if (state === 'untracked') {
        await git('config', 'status.showUntrackedFiles', 'no')
      }
      if (state === 'staged') {
        await git('add', name)
      }
      await expect(verifyReleaseCommit(rootDir)).rejects.toThrow(
        'Commit the complete release changes',
      )
    },
  )
})

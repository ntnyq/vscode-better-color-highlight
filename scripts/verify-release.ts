import { execFile } from 'node:child_process'
import process from 'node:process'
import { promisify } from 'node:util'

const execute = promisify(execFile)

/**
 * Require the prepared sources to belong to a reviewed release commit.
 */
export async function verifyReleaseCommit(rootDir: string): Promise<void> {
  const { stdout } = await execute(
    'git',
    ['status', '--porcelain', '--untracked-files=all'],
    {
      cwd: rootDir,
    },
  )
  if (stdout.trim()) {
    throw new Error(
      'Commit the complete release changes before publishing. Run pnpm release for preparation only.',
    )
  }
}

if (import.meta.main) {
  try {
    await verifyReleaseCommit(process.cwd())
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

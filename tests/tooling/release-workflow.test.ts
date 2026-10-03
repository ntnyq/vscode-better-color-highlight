import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('release workflow', () => {
  it('runs an exact lockfile-pinned changelogithub dependency', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      devDependencies: Record<string, string>
    }
    const workflow = await readFile('.github/workflows/release.yml', 'utf8')

    expect(packageJson.devDependencies.changelogithub).toMatch(/^\d/u)
    expect(workflow).toContain('pnpm/action-setup@')
    expect(workflow).toContain('pnpm install --frozen-lockfile')
    expect(workflow).toContain('pnpm exec changelogithub')
    expect(workflow).not.toContain('npx changelogithub')
  })
})

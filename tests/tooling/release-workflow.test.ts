import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('release workflow', () => {
  it('checks the final version before uploading without bumping it again', async () => {
    const { scripts } = JSON.parse(await readFile('package.json', 'utf8')) as {
      scripts: Record<string, string>
    }

    expect(scripts['release:check'].split(' ')).toStrictEqual([
      'run-s',
      'format:check',
      'lint',
      'typecheck',
      'test',
      'test:package',
    ])
    expect(scripts.test).toBe('run-s test:unit test:e2e')
    expect(scripts['test:e2e']).toContain('test:e2e:electron')
    expect(scripts['test:e2e']).toContain('test:e2e:web')
    expect(scripts.release).toBe('run-s release:version release:publish')
    expect(scripts['release:publish']).toBe(
      'run-s release:check release:upload',
    )
    expect(scripts['release:upload']).toBe('vsce publish --no-dependencies')
    for (const flag of ['--no-commit', '--no-tag', '--no-push']) {
      expect(scripts['release:version']).toContain(flag)
    }
    expect(scripts['release:version']).toContain('pnpm release:build')
  })

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

import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { version } from '../../src/meta'

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
    expect(scripts.release).toBe('run-s release:version release:check')
    expect(scripts['release:publish']).toBe(
      'run-s release:verify release:check release:verify release:upload',
    )
    expect(scripts['release:upload']).toBe(
      'vsce publish --packagePath dist/release.vsix',
    )
    for (const flag of ['--no-commit', '--no-tag', '--no-push']) {
      expect(scripts['release:version']).toContain(flag)
    }
    expect(scripts['release:version']).toContain('pnpm release:build')
  })

  it('keeps the prepared manifest and generated metadata at the same version', async () => {
    const manifest = JSON.parse(await readFile('package.json', 'utf8')) as {
      version: string
    }
    expect(version).toBe(manifest.version)
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

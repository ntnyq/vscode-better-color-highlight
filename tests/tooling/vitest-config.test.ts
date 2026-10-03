import { describe, expect, it } from 'vitest'
import { configDefaults } from 'vitest/config'
import config from '../../vitest.config'

describe('vitest configuration', () => {
  it('only discovers repository unit tests, excluding downloaded VS Code suites', () => {
    expect(config.test?.include).toStrictEqual(['tests/**/*.test.ts'])
  })

  it('excludes repository-local linked worktrees', () => {
    expect(config.test?.exclude).toContain('**/.worktrees/**')
    expect(config.test?.exclude).toStrictEqual(
      expect.arrayContaining(configDefaults.exclude),
    )
  })
})

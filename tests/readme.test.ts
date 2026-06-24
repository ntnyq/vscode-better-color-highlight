import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('readme generated config documentation', () => {
  it('preserves wildcard asterisks in language configuration defaults', async () => {
    const readme = await readFile('README.md', 'utf8')

    expect(readme).toContain('`["*"]`')
    expect(readme).not.toContain('`["_"]`')
  })
})

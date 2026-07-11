import { describe, expect, it } from 'vitest'
import { getWorkspacePathIdentity } from '../src/utils/workspace-file-system'
import { createWorkspaceReadBudget } from '../src/utils/workspace-read-budget'

describe('workspace dependency read budget', () => {
  it('allows repeated claims without consuming another unique slot', () => {
    const budget = createWorkspaceReadBudget(2)

    expect(budget.tryClaim('file:///repo/a.css')).toBe(true)
    expect(budget.tryClaim('/repo/a.css')).toBe(true)
    expect(budget.tryClaim('/repo/b.css')).toBe(true)
    expect(budget.tryClaim('/repo/c.css')).toBe(false)
  })

  it('refuses reads after 512 unique identities', () => {
    const budget = createWorkspaceReadBudget(512)

    for (let index = 0; index < 512; index++) {
      expect(budget.tryClaim(`/repo/${index}.css`)).toBe(true)
    }

    expect(budget.tryClaim('/repo/512.css')).toBe(false)
    expect(budget.tryClaim('/repo/0.css')).toBe(true)
  })

  it('canonicalizes local file URI and fsPath identities', () => {
    expect(getWorkspacePathIdentity('file:///repo/a%20b.css')).toBe(
      getWorkspacePathIdentity('/repo/a b.css'),
    )
    expect(getWorkspacePathIdentity('file:///C:/repo/a.css')).toBe(
      getWorkspacePathIdentity(String.raw`c:\repo\a.css`),
    )
  })

  it('keeps distinct virtual URIs separate', () => {
    expect(
      getWorkspacePathIdentity(
        'vscode-remote://ssh-remote+one/workspace/theme.css',
      ),
    ).not.toBe(
      getWorkspacePathIdentity(
        'vscode-remote://ssh-remote+two/workspace/theme.css',
      ),
    )
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid maximum %s',
    maximum => {
      expect(() => createWorkspaceReadBudget(maximum)).toThrow(RangeError)
    },
  )
})

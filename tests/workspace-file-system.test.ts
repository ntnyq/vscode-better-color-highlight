import { describe, expect, it } from 'vitest'
import {
  basenameWorkspacePath,
  dirnameWorkspacePath,
  extnameWorkspacePath,
  isAbsoluteWorkspacePath,
  joinWorkspacePath,
  resolveWorkspacePath,
} from '../src/utils/workspace-file-system'

describe('workspace file system path helpers', () => {
  it('treats Windows drive paths as local paths instead of URI schemes', () => {
    const filePath = String.raw`C:\repo\src\entry.scss`

    expect(isAbsoluteWorkspacePath(filePath)).toBe(true)
    expect(basenameWorkspacePath(filePath)).toBe('entry.scss')
    expect(extnameWorkspacePath(filePath)).toBe('.scss')
    expect(dirnameWorkspacePath(filePath)).toBe('C:/repo/src')
    expect(resolveWorkspacePath(filePath, '../tokens')).toBe('C:/repo/tokens')
  })

  it('preserves URI authorities and encodes path-only special characters', () => {
    const fileUri = 'vscode-remote://ssh-remote+host/home/me/src/entry.scss'

    expect(
      joinWorkspacePath(dirnameWorkspacePath(fileUri), 'theme #1.scss'),
    ).toBe('vscode-remote://ssh-remote+host/home/me/src/theme%20%231.scss')
    expect(resolveWorkspacePath(fileUri, '../tokens?raw')).toBe(
      'vscode-remote://ssh-remote+host/home/me/tokens%3Fraw',
    )
  })
})

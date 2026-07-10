import { describe, expect, it, vi } from 'vitest'
import type * as Vscode from 'vscode'
import {
  basenameWorkspacePath,
  dirnameWorkspacePath,
  extnameWorkspacePath,
  isAbsoluteWorkspacePath,
  joinWorkspacePath,
  readWorkspaceFile,
  resolveWorkspacePath,
  statWorkspaceFile,
} from '../src/utils/workspace-file-system'

const fileUri = {
  scheme: 'file',
  fsPath: '/tmp/tokens.css',
  toString: () => 'file:///tmp/tokens.css',
}
const openDocument = {
  getText: () => ':root { --brand: #0ea5e9; }',
  uri: fileUri,
  version: 7,
}

vi.mock(
  import('vscode'),
  () =>
    ({
      Uri: {
        file: () => fileUri,
        parse: () => fileUri,
      },
      workspace: {
        fs: {
          readFile: vi
            .fn<() => Promise<Uint8Array>>()
            .mockResolvedValue(new TextEncoder().encode('disk text')),
          stat: vi
            .fn<() => Promise<{ mtime: number; size: number }>>()
            .mockResolvedValue({ mtime: 1, size: 9 }),
        },
        textDocuments: [openDocument],
      },
    }) as unknown as Partial<typeof Vscode>,
)

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
    const remoteFileUri =
      'vscode-remote://ssh-remote+host/home/me/src/entry.scss'

    expect(
      joinWorkspacePath(dirnameWorkspacePath(remoteFileUri), 'theme #1.scss'),
    ).toBe('vscode-remote://ssh-remote+host/home/me/src/theme%20%231.scss')
    expect(resolveWorkspacePath(remoteFileUri, '../tokens?raw')).toBe(
      'vscode-remote://ssh-remote+host/home/me/tokens%3Fraw',
    )
  })

  it('reads unsaved open-document text and reports its version', async () => {
    await expect(readWorkspaceFile('/tmp/tokens.css')).resolves.toBe(
      ':root { --brand: #0ea5e9; }',
    )
    await expect(statWorkspaceFile('/tmp/tokens.css')).resolves.toStrictEqual({
      documentVersion: 7,
      mtimeMs: 1,
      size: 27,
    })
  })
})

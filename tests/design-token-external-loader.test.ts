import { describe, expect, it, vi } from 'vitest'
import type * as WorkspaceFileSystem from '../src/utils/workspace-file-system'

interface FileState {
  documentVersion?: number
  mtimeMs: number
  size: number
  text: string
}

const files = new Map<string, FileState>()
const readFileMock = vi.fn<(filePath: string) => Promise<string>>(filePath => {
  const file = files.get(filePath)
  if (!file) {
    throw new Error(`Missing file: ${filePath}`)
  }
  return Promise.resolve(file.text)
})
const statFileMock = vi.fn<
  (filePath: string) => Promise<{
    documentVersion?: number
    mtimeMs: number
    size: number
  }>
>(filePath => {
  const file = files.get(filePath)
  if (!file) {
    throw new Error(`Missing file: ${filePath}`)
  }
  return Promise.resolve(file)
})

vi.mock(
  import('../src/utils/workspace-file-system'),
  async importActual =>
    ({
      ...(await importActual()),
      readWorkspaceFile: readFileMock,
      statWorkspaceFile: statFileMock,
    }) as unknown as Partial<typeof WorkspaceFileSystem>,
)

describe('external design token references', () => {
  it('does not read external files when disabled or untrusted', async () => {
    resetFiles()
    const { findJsonDesignTokens } = await importJsonStrategy()
    const text = createJsonReference('./palette.yaml#/brand/$value')

    const disabled = await findJsonDesignTokens(text, {
      languageId: 'json',
      filePath: '/workspace/root.json',
      resolveDesignTokensAcrossFiles: false,
      workspaceIsTrusted: true,
    })
    const untrusted = await findJsonDesignTokens(text, {
      languageId: 'json',
      filePath: '/workspace/root.json',
      resolveDesignTokensAcrossFiles: true,
      workspaceIsTrusted: false,
    })

    expect(disabled).toStrictEqual([])
    expect(untrusted).toStrictEqual([])
    expect(readFileMock).not.toHaveBeenCalled()
  })

  it('resolves trusted JSON to YAML and YAML to JSON references', async () => {
    resetFiles()
    setFile(
      '/workspace/palette.yaml',
      `brand:\n  $type: color\n  $value: { colorSpace: srgb, components: [1, 0, 0] }\n`,
    )
    setFile(
      '/workspace/palette.json',
      JSON.stringify({
        brand: {
          $type: 'color',
          $value: { colorSpace: 'srgb', components: [0, 0, 1] },
        },
      }),
    )
    const { findJsonDesignTokens } = await importJsonStrategy()
    const { findYamlDesignTokens } = await importYamlStrategy()

    const jsonMatches = await findJsonDesignTokens(
      createJsonReference('./palette.yaml#/brand/$value'),
      trustedContext('json', '/workspace/root.json'),
    )
    const yamlMatches = await findYamlDesignTokens(
      `$type: color\n$ref: "./palette.json#/brand/$value"\n`,
      trustedContext('yaml', '/workspace/root.yaml'),
    )

    expect(jsonMatches).toMatchObject([{ color: 'rgb(255, 0, 0)' }])
    expect(yamlMatches).toMatchObject([{ color: 'rgb(0, 0, 255)' }])
  })

  it('resolves chained references and rejects cross-file cycles', async () => {
    resetFiles()
    setFile(
      '/workspace/middle.yaml',
      `$type: color\n$ref: "./leaf.json#/brand/$value"\n`,
    )
    setFile(
      '/workspace/leaf.json',
      JSON.stringify({
        brand: {
          $type: 'color',
          $value: { colorSpace: 'srgb', components: [0, 1, 0] },
        },
      }),
    )
    const { findJsonDesignTokens } = await importJsonStrategy()
    const chained = await findJsonDesignTokens(
      createJsonReference('./middle.yaml#/$value'),
      trustedContext('json', '/workspace/root.json'),
    )
    expect(chained).toMatchObject([{ color: 'rgb(0, 255, 0)' }])

    resetFiles()
    setFile('/workspace/a.yaml', `$type: color\n$ref: "./b.json#/$value"\n`)
    setFile('/workspace/b.json', createJsonReference('./a.yaml#/$value'))
    const cyclic = await findJsonDesignTokens(
      createJsonReference('./a.yaml#/$value'),
      trustedContext('json', '/workspace/root.json'),
    )
    expect(cyclic).toStrictEqual([])
  })

  it('rejects oversized dependencies before reading them', async () => {
    resetFiles()
    setFile('/workspace/palette.json', '{}', 524_289)
    const { findJsonDesignTokens } = await importJsonStrategy()

    const matches = await findJsonDesignTokens(
      createJsonReference('./palette.json#/brand/$value'),
      trustedContext('json', '/workspace/root.json'),
    )

    expect(matches).toStrictEqual([])
    expect(readFileMock).not.toHaveBeenCalled()
  })

  it('caches by open-document version as well as file metadata', async () => {
    resetFiles()
    const dependencyPath = '/workspace/palette.json'
    setFile(
      dependencyPath,
      JSON.stringify({
        brand: {
          $type: 'color',
          $value: { colorSpace: 'srgb', components: [1, 0, 0] },
        },
      }),
      undefined,
      1,
    )
    const { findJsonDesignTokens } = await importJsonStrategy()
    const root = createJsonReference('./palette.json#/brand/$value')
    const context = trustedContext('json', '/workspace/root.json')

    await findJsonDesignTokens(root, context)
    await findJsonDesignTokens(root, context)
    expect(readFileMock).toHaveBeenCalledTimes(1)

    const file = files.get(dependencyPath)!
    setFile(
      dependencyPath,
      file.text.replace('[1,0,0]', '[0,1,0]'),
      undefined,
      2,
    )
    await findJsonDesignTokens(root, context)

    expect(readFileMock).toHaveBeenCalledTimes(2)
  })
})

function createJsonReference(reference: string): string {
  return JSON.stringify({ $type: 'color', $ref: reference })
}

function trustedContext(languageId: string, filePath: string) {
  return {
    languageId,
    filePath,
    resolveDesignTokensAcrossFiles: true,
    workspaceIsTrusted: true,
  }
}

async function importJsonStrategy() {
  return await import('../src/strategies/json-design-tokens')
}

async function importYamlStrategy() {
  return await import('../src/strategies/yaml-design-tokens')
}

function resetFiles(): void {
  vi.resetModules()
  files.clear()
  readFileMock.mockClear()
  statFileMock.mockClear()
}

function setFile(
  filePath: string,
  text: string,
  explicitSize?: number,
  documentVersion?: number,
): void {
  files.set(filePath, {
    documentVersion,
    mtimeMs: 1,
    size: explicitSize ?? new TextEncoder().encode(text).byteLength,
    text,
  })
}

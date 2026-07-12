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

  it('starts no token read after cancellation during a deferred external stat', async () => {
    resetFiles()
    const deferred = Promise.withResolvers<{
      mtimeMs: number
      size: number
    }>()
    statFileMock.mockReturnValueOnce(deferred.promise)
    let cancelled = false
    const { findJsonDesignTokens } = await importJsonStrategy()
    const promise = findJsonDesignTokens(
      createJsonReference('./palette.yaml#/brand/$value'),
      {
        ...trustedContext('json', '/workspace/root.json'),
        signal: {
          get isCancellationRequested() {
            return cancelled
          },
        },
      },
    )

    await vi.waitFor(() => expect(statFileMock).toHaveBeenCalledTimes(1))
    cancelled = true
    deferred.resolve({ mtimeMs: 1, size: 24 })

    await expect(promise).resolves.toStrictEqual([])
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

  it('loads JSON-formatted .tokens dependencies', async () => {
    resetFiles()
    setFile(
      '/workspace/palette.tokens',
      JSON.stringify({
        brand: {
          $type: 'color',
          $value: { colorSpace: 'srgb', components: [1, 0, 0] },
        },
      }),
    )
    const { findJsonDesignTokens } = await importJsonStrategy()

    await expect(
      findJsonDesignTokens(
        createJsonReference('./palette.tokens#/brand/$value'),
        trustedContext('json', '/workspace/root.tokens'),
      ),
    ).resolves.toMatchObject([{ color: 'rgb(255, 0, 0)' }])
  })

  it('bounds every resolution run to 64 sequential unique dependency reads', async () => {
    resetFiles()
    const references: Record<string, unknown> = {}
    for (let index = 0; index < 80; index++) {
      const path = `/workspace/palette-${index}.json`
      setFile(
        path,
        JSON.stringify({
          brand: {
            $type: 'color',
            $value: { colorSpace: 'srgb', components: [1, 0, 0] },
          },
        }),
      )
      references[`color${index}`] = {
        $type: 'color',
        $ref: `./palette-${index}.json#/brand/$value`,
      }
    }
    let activeStats = 0
    let maximumActiveStats = 0
    statFileMock.mockImplementation(async filePath => {
      activeStats++
      maximumActiveStats = Math.max(maximumActiveStats, activeStats)
      await Promise.resolve()
      activeStats--
      return files.get(filePath)!
    })
    const { findJsonDesignTokens } = await importJsonStrategy()

    const matches = await findJsonDesignTokens(
      JSON.stringify(references),
      trustedContext('json', '/workspace/root.json'),
    )

    expect(matches).toHaveLength(64)
    expect(statFileMock).toHaveBeenCalledTimes(64)
    expect(maximumActiveStats).toBe(1)
  })

  it('canonicalizes and evicts the 256-entry external document cache', async () => {
    resetFiles()
    for (let index = 0; index <= 256; index++) {
      setFile(`/workspace/cache-${index}.json`, '{}')
    }
    files.set(
      'file:///workspace/cache-0.json',
      files.get('/workspace/cache-0.json')!,
    )
    const { loadDesignTokenDocument } =
      await import('../src/strategies/design-tokens/external-loader')

    await loadDesignTokenDocument('/workspace/cache-0.json')
    await loadDesignTokenDocument('file:///workspace/cache-0.json')
    expect(readFileMock).toHaveBeenCalledTimes(1)

    for (let index = 1; index <= 256; index++) {
      await loadDesignTokenDocument(`/workspace/cache-${index}.json`)
    }
    await loadDesignTokenDocument('/workspace/cache-0.json')

    expect(readFileMock).toHaveBeenCalledTimes(258)
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

  it('resolves pointers to external $root tokens', async () => {
    resetFiles()
    setFile(
      '/workspace/palette.yaml',
      `palette:
  $root:
    $type: color
    $value: { colorSpace: srgb, components: [1, 0, 0] }
`,
    )
    const { findJsonDesignTokens } = await importJsonStrategy()

    const matches = await findJsonDesignTokens(
      createJsonReference('./palette.yaml#/palette/$root/$value'),
      trustedContext('json', '/workspace/root.json'),
    )

    expect(matches).toMatchObject([{ color: 'rgb(255, 0, 0)' }])
  })

  it('still highlights references to unnamed external root tokens', async () => {
    resetFiles()
    setFile(
      '/workspace/palette.yaml',
      `$type: color
$value: { colorSpace: srgb, components: [1, 0, 0] }
`,
    )
    const { findJsonDesignTokens } = await importJsonStrategy()

    const matches = await findJsonDesignTokens(
      createJsonReference('./palette.yaml#/$value'),
      trustedContext('json', '/workspace/root.json'),
    )

    expect(matches).toMatchObject([{ color: 'rgb(255, 0, 0)' }])
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

  it('isolates the third unique file without resolving partial aliases', async () => {
    resetFiles()
    for (const [name, components] of [
      ['one', [1, 0, 0]],
      ['two', [0, 1, 0]],
      ['three', [0, 0, 1]],
    ] as const) {
      setFile(
        `/workspace/${name}.json`,
        JSON.stringify({
          brand: {
            $type: 'color',
            $value: { colorSpace: 'srgb', components },
          },
        }),
      )
    }
    const { findJsonDesignTokens } = await importJsonStrategy()
    const text = JSON.stringify({
      one: { $type: 'color', $ref: './one.json#/brand/$value' },
      two: { $type: 'color', $ref: './two.json#/brand/$value' },
      three: { $type: 'color', $ref: './three.json#/brand/$value' },
      alias: { $type: 'color', $value: '{three}' },
    })
    const context = {
      ...trustedContext('json', '/workspace/root.json'),
      workspaceReadBudget: createTestBudget(2),
    }

    const first = await findJsonDesignTokens(text, context)
    const second = await findJsonDesignTokens(text, context)

    expect(first.map(match => match.color)).toStrictEqual([
      'rgb(255, 0, 0)',
      'rgb(0, 255, 0)',
    ])
    expect(second).toStrictEqual(first)
    expect(readFileMock).toHaveBeenCalledTimes(2)
    expect(statFileMock.mock.calls.flat()).not.toContain(
      '/workspace/three.json',
    )
  })

  it('claims external documents before metadata and content reads', async () => {
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
    )
    const { findJsonDesignTokens } = await importJsonStrategy()
    const text = createJsonReference('./palette.json#/brand/$value')

    const exhaustedBudget = createTestBudget(1)
    exhaustedBudget.tryClaim('/workspace/already-claimed.json')
    await expect(
      findJsonDesignTokens(text, {
        ...trustedContext('json', '/workspace/root.json'),
        workspaceReadBudget: exhaustedBudget,
      }),
    ).resolves.toStrictEqual([])
    expect(statFileMock).not.toHaveBeenCalled()
    expect(readFileMock).not.toHaveBeenCalled()

    const repeatedBudget = createTestBudget(1)
    repeatedBudget.tryClaim(dependencyPath)
    await expect(
      findJsonDesignTokens(text, {
        ...trustedContext('json', '/workspace/root.json'),
        workspaceReadBudget: repeatedBudget,
      }),
    ).resolves.toMatchObject([{ color: 'rgb(255, 0, 0)' }])
    expect(statFileMock).toHaveBeenCalledWith(dependencyPath)
    expect(readFileMock).toHaveBeenCalledWith(dependencyPath)
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

function createTestBudget(maximum: number) {
  const claimed = new Set<string>()
  return {
    tryClaim(identity: string) {
      if (claimed.has(identity)) {
        return true
      }
      if (claimed.size >= maximum) {
        return false
      }
      claimed.add(identity)
      return true
    },
  }
}

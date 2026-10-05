import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StrategyContext } from '../../../../src/engine/detection'
import type * as WorkspaceFileSystem from '../../../../src/shared/workspace/file-system'

const files = new Map<string, string>()
const readDirectory = vi.fn<typeof WorkspaceFileSystem.readWorkspaceDirectory>()
const readFile = vi.fn<typeof WorkspaceFileSystem.readWorkspaceFile>()
const statFile = vi.fn<typeof WorkspaceFileSystem.statWorkspaceFile>()
vi.mock(
  import('../../../../src/shared/workspace/file-system'),
  async importActual => ({
    ...(await importActual()),
    readWorkspaceDirectory: readDirectory,
    readWorkspaceFile: readFile,
    statWorkspaceFile: statFile,
  }),
)

const { resolveAndroidColorDefinition } =
  await import('../../../../src/engine/strategies/android-resources/definition')
const { getWorkspacePathIdentity } =
  await import('../../../../src/shared/workspace/file-system')
const { createWorkspaceReadBudget } =
  await import('../../../../src/shared/workspace/read-budget')

const ROOT = '/workspace/app/src/main/res'
const COLORS = `${ROOT}/values/colors.xml`
const ALIASES = `${ROOT}/values/aliases.xml`
const SOURCE = '<TextView android:textColor="@color/alias"/>'
const CONTEXT: StrategyContext = {
  languageId: 'xml',
  filePath: `${ROOT}/layout/main.xml`,
  workspaceIsTrusted: true,
}

function resolve(text = SOURCE, context = CONTEXT) {
  return resolveAndroidColorDefinition(
    text,
    text.indexOf('@color/') + 8,
    context,
  )
}

function resource(name: string, value: string): string {
  return `<resources><color name="${name}">${value}</color></resources>`
}

function listResourcePaths(
  path: string,
): ReturnType<typeof WorkspaceFileSystem.readWorkspaceDirectory> {
  const prefix = `${getWorkspacePathIdentity(path)}/`
  const entries = new Map<
    string,
    { name: string; kind: 'file' | 'directory' }
  >()
  for (const filePath of files.keys()) {
    if (!filePath.startsWith(prefix)) {
      continue
    }
    const relative = filePath.slice(prefix.length)
    const name = relative.split('/')[0]
    entries.set(name, {
      name,
      kind: relative.includes('/') ? 'directory' : 'file',
    })
  }
  return Promise.resolve([...entries.values()])
}

describe('android resource definition navigation', () => {
  beforeEach(() => {
    files.clear()
    files.set(COLORS, resource('brand', '#80ff0000'))
    files.set(ALIASES, resource('alias', '@color/brand'))
    readDirectory.mockReset().mockImplementation(listResourcePaths)
    statFile.mockReset().mockImplementation(path =>
      Promise.resolve({
        mtimeMs: 1,
        size: files.get(getWorkspacePathIdentity(path))?.length ?? 0,
      }),
    )
    readFile.mockReset().mockImplementation(path => {
      const text = files.get(getWorkspacePathIdentity(path))
      return text === undefined
        ? Promise.reject(new Error('Missing resource'))
        : Promise.resolve(text)
    })
  })

  it('follows cross-file aliases to the terminal declaration with precise ranges', async () => {
    const target = await resolve()
    const text = files.get(COLORS) ?? ''
    expect(target).toStrictEqual({
      originRange: {
        start: SOURCE.indexOf('@color/alias'),
        end: SOURCE.indexOf('@color/alias') + 12,
      },
      targetFilePath: COLORS,
      targetRange: { start: 11, end: text.indexOf('</resources>') },
      targetSelectionRange: {
        start: text.indexOf('brand'),
        end: text.indexOf('brand') + 5,
      },
      targetText: text,
    })
    expect(readDirectory.mock.calls).toStrictEqual([[ROOT], [`${ROOT}/values`]])
  })

  it('uses the current unsaved values document and supports item aliases', async () => {
    const text =
      '<resources><color name="brand">#123</color><item type="color" name="alias">@color/brand</item></resources>'
    files.delete(ALIASES)
    const target = await resolve(text, {
      ...CONTEXT,
      filePath: `file://${COLORS}`,
    })
    expect(target?.targetFilePath).toBe(`file://${COLORS}`)
    expect(target?.targetText).toBe(text)
    expect(readFile).not.toHaveBeenCalled()
    expect(statFile).not.toHaveBeenCalled()
  })

  it.each([
    { workspaceIsTrusted: false },
    { signal: { isCancellationRequested: true } },
    { languageId: 'html' },
    { filePath: '/workspace/colors.xml' },
    { filePath: `${ROOT}/raw/data.xml` },
    { filePath: `${ROOT}/layout/nested/main.xml` },
  ])('does no discovery or reading for a gated context: %j', async override => {
    await expect(
      resolve(SOURCE, { ...CONTEXT, ...override }),
    ).resolves.toBeNull()
    expect(readDirectory).not.toHaveBeenCalled()
    expect(readFile).not.toHaveBeenCalled()
  })

  it('does no discovery when the cursor is outside a complete reference', async () => {
    await expect(
      resolveAndroidColorDefinition(
        SOURCE,
        SOURCE.indexOf('@color/alias') + 12,
        CONTEXT,
      ),
    ).resolves.toBeNull()
    await expect(
      resolve('<TextView text="@android:color/white"/>'),
    ).resolves.toBeNull()
    expect(readDirectory).not.toHaveBeenCalled()
  })

  it.each(['#f00', '#8f00', '#ff0000', '#80ff0000'])(
    'accepts Android static color %s',
    async value => {
      files.set(COLORS, resource('brand', value))
      await expect(resolve()).resolves.not.toBeNull()
    },
  )

  it.each([
    'red',
    '#12345',
    '#1234567',
    'rgb(1 2 3)',
    '?attr/colorPrimary',
    '@android:color/white',
    '@color/missing',
  ])('rejects non-static or missing terminal value %s', async value => {
    files.set(COLORS, resource('brand', value))
    await expect(resolve()).resolves.toBeNull()
  })

  it.each([
    ['values/duplicate.xml', 'brand'],
    ['values-night/colors.xml', 'brand'],
    ['values-v31/colors.xml', 'alias'],
    ['color/brand.xml', 'brand'],
    ['color-night/alias.xml', 'alias'],
  ])(
    'rejects duplicate, qualified, and state-list names: %s',
    async (path, name) => {
      files.set(`${ROOT}/${path}`, resource(name, '#fff'))
      await expect(resolve()).resolves.toBeNull()
      readDirectory.mockImplementationOnce(async directoryPath => {
        const entries = await listResourcePaths(directoryPath)
        return entries.toReversed()
      })
      await expect(resolve()).resolves.toBeNull()
    },
  )

  it('allows unrelated qualifiers, but rejects duplicates within one file', async () => {
    files.set(`${ROOT}/values-night/other.xml`, resource('other', '#000'))
    await expect(resolve()).resolves.not.toBeNull()
    files.set(
      COLORS,
      '<resources><color name="brand">#f00</color><color name="brand">#f00</color></resources>',
    )
    await expect(resolve()).resolves.toBeNull()
  })

  it('rejects cycles and bounds long acyclic alias chains', async () => {
    files.set(COLORS, resource('brand', '@color/alias'))
    await expect(resolve()).resolves.toBeNull()
    files.set(COLORS, resource('brand', '@color/brand'))
    await expect(resolve()).resolves.toBeNull()
    files.set(
      COLORS,
      `<resources>${Array.from({ length: 70 }, (_, index) => `<color name="c${index}">${index === 69 ? '#fff' : `@color/c${index + 1}`}</color>`).join('')}<color name="brand">@color/c0</color></resources>`,
    )
    await expect(resolve()).resolves.toBeNull()
  })

  it('rebuilds after edits, deletions, creations, and qualifier renames', async () => {
    await expect(resolve()).resolves.toMatchObject({
      targetText: expect.stringContaining('#80ff0000'),
    })
    files.set(COLORS, resource('brand', '#00000000'))
    await expect(resolve()).resolves.toMatchObject({
      targetText: expect.stringContaining('#00000000'),
    })
    files.set(COLORS, resource('brand', '@color/missing'))
    await expect(resolve()).resolves.toBeNull()
    files.set(`${ROOT}/values/new.xml`, resource('missing', '#fff'))
    await expect(resolve()).resolves.toMatchObject({
      targetFilePath: `${ROOT}/values/new.xml`,
    })
    files.delete(`${ROOT}/values/new.xml`)
    files.set(`${ROOT}/values-night/new.xml`, resource('missing', '#fff'))
    await expect(resolve()).resolves.toBeNull()
  })

  it('rejects incomplete indexes after discovery overflow, denied budgets, or unreadable files', async () => {
    readDirectory
      .mockResolvedValueOnce([{ name: 'values', kind: 'directory' }])
      .mockResolvedValueOnce(
        Array.from({ length: 65 }, (_, index) => ({
          name: `${index}.xml`,
          kind: 'file',
        })),
      )
    await expect(resolve()).resolves.toBeNull()
    expect(statFile).not.toHaveBeenCalled()
    await expect(
      resolve(SOURCE, {
        ...CONTEXT,
        workspaceReadBudget: createWorkspaceReadBudget(1),
      }),
    ).resolves.toBeNull()
    expect(statFile).not.toHaveBeenCalled()
    readFile.mockRejectedValueOnce(new Error('read failed'))
    await expect(resolve()).resolves.toBeNull()
    readDirectory.mockRejectedValueOnce(new Error('listing failed'))
    await expect(resolve()).resolves.toBeNull()
  })

  it('rejects malformed and oversized dependencies without returning partial targets', async () => {
    files.set(`${ROOT}/values/other.xml`, '<resources><color')
    await expect(resolve()).resolves.toBeNull()
    statFile.mockResolvedValueOnce({ mtimeMs: 1, size: 512 * 1024 + 1 })
    readFile.mockClear()
    await expect(resolve()).resolves.toBeNull()
    expect(readFile).not.toHaveBeenCalled()
  })

  it.each(
    [
      Array.from({ length: 65 }, (_, index) => ({
        name: `values-v${index}`,
        kind: 'directory' as const,
      })),
      Array.from({ length: 4097 }, (_, index) => ({
        name: `unrelated${index}`,
        kind: 'file' as const,
      })),
      [{ name: 'values', kind: 'unknown' as const }],
    ].map(entries => ({ entries })),
  )(
    'rejects oversized or unsupported resource directory listings',
    async ({ entries }) => {
      readDirectory.mockResolvedValueOnce(entries)
      await expect(resolve()).resolves.toBeNull()
      expect(readDirectory).toHaveBeenCalledTimes(1)
      expect(statFile).not.toHaveBeenCalled()
    },
  )

  it.each(
    [
      [{ name: 'linked.xml', kind: 'unknown' as const }],
      [{ name: '../outside.xml', kind: 'file' as const }],
      Array.from({ length: 4097 }, (_, index) => ({
        name: `unrelated${index}`,
        kind: 'file' as const,
      })),
    ].map(entries => ({ entries })),
  )(
    'rejects incomplete, linked, or escaping resource file listings',
    async ({ entries }) => {
      readDirectory
        .mockResolvedValueOnce([{ name: 'values', kind: 'directory' }])
        .mockResolvedValueOnce(entries)
      await expect(resolve()).resolves.toBeNull()
      expect(statFile).not.toHaveBeenCalled()
    },
  )

  it('checks byte limits after reading, including growth since stat', async () => {
    const oversized = `<!--${'界'.repeat(180_000)}-->${resource('brand', '#fff')}`
    statFile.mockResolvedValueOnce({ mtimeMs: 1, size: 10 })
    readFile.mockResolvedValueOnce(oversized)
    await expect(resolve()).resolves.toBeNull()
    readDirectory.mockClear()
    await expect(resolve(`${oversized}${SOURCE}`)).resolves.toBeNull()
    expect(readDirectory).not.toHaveBeenCalled()
  })

  it('never uses another module or source-set root', async () => {
    for (const path of [
      '/workspace/library/src/main/res',
      '/workspace/app/src/debug/res',
    ]) {
      files.set(`${path}/values/colors.xml`, resource('brand', '#fff'))
    }
    await expect(resolve()).resolves.toMatchObject({ targetFilePath: COLORS })
    expect(readDirectory.mock.calls).toStrictEqual([[ROOT], [`${ROOT}/values`]])
    expect(readFile.mock.calls).toStrictEqual([[COLORS], [ALIASES]])
  })

  it.each(['discovery', 'stat', 'read'] as const)(
    'cancels after deferred %s and stops further I/O',
    async phase => {
      const signal = { isCancellationRequested: false }
      const deferred = Promise.withResolvers<null>()
      if (phase === 'discovery') {
        readDirectory.mockImplementationOnce(async () => {
          await deferred.promise
          return [{ name: 'values', kind: 'directory' }]
        })
      } else if (phase === 'stat') {
        statFile.mockImplementationOnce(async () => {
          await deferred.promise
          return { mtimeMs: 1, size: 40 }
        })
      } else {
        readFile.mockImplementationOnce(async () => {
          await deferred.promise
          return resource('brand', '#fff')
        })
      }
      const pending = resolve(SOURCE, { ...CONTEXT, signal })
      const deferredMock = {
        discovery: readDirectory,
        stat: statFile,
        read: readFile,
      }[phase]
      await vi.waitFor(() => {
        expect(deferredMock).toHaveBeenCalledTimes(1)
      })
      signal.isCancellationRequested = true
      deferred.resolve(null)
      await expect(pending).resolves.toBeNull()
      expect(readFile).toHaveBeenCalledTimes(phase === 'read' ? 1 : 0)
    },
  )

  it.each([
    ['vscode-vfs://repo/app/res', 'vscode-vfs://repo/app/res/layout/main.xml'],
    ['c:/workspace/app/res', String.raw`C:\workspace\app\res\layout\main.xml`],
  ])('supports virtual and Windows paths: %s', async (root, filePath) => {
    files.clear()
    files.set(`${root}/values/colors.xml`, resource('alias', '#f00'))
    const target = await resolve(SOURCE, { ...CONTEXT, filePath })
    expect(getWorkspacePathIdentity(target?.targetFilePath ?? '')).toBe(
      `${root}/values/colors.xml`,
    )
  })
})

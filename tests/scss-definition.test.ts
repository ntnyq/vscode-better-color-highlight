import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  resolve,
} from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as WorkspaceFileSystem from '../src/utils/workspace-file-system'

const fileTexts = new Map<string, string>()
const fileVersions = new Map<string, number>()
const existsMock = vi.fn<(filePath: string) => Promise<boolean>>(filePath =>
  Promise.resolve(fileTexts.has(filePath)),
)
const readFileMock = vi.fn<(filePath: string) => Promise<string>>(filePath => {
  const text = fileTexts.get(filePath)
  if (text === undefined) {
    throw new Error('missing')
  }
  return Promise.resolve(text)
})
const statMock = vi.fn<
  (filePath: string) => Promise<{
    documentVersion: number | undefined
    mtimeMs: number
    size: number
  }>
>(filePath => {
  const text = fileTexts.get(filePath)
  if (text === undefined) {
    throw new Error('missing')
  }
  return Promise.resolve({
    documentVersion: fileVersions.get(filePath),
    mtimeMs: fileVersions.get(filePath) ?? 1,
    size: text.length,
  })
})

vi.mock(
  import('../src/utils/workspace-file-system'),
  () =>
    ({
      basenameWorkspacePath: basename,
      dirnameWorkspacePath: dirname,
      extnameWorkspacePath: extname,
      isAbsoluteWorkspacePath: isAbsolute,
      joinWorkspacePath: join,
      readWorkspaceFile: readFileMock,
      resolveWorkspacePath: (baseFilePath: string, value: string) =>
        isAbsolute(value) ? value : resolve(dirname(baseFilePath), value),
      statWorkspaceFile: statMock,
      workspacePathExists: existsMock,
    }) as unknown as Partial<typeof WorkspaceFileSystem>,
)

const context = {
  languageId: 'scss',
  filePath: '/workspace/main.scss',
  resolveScssVariablesAcrossFiles: true,
  workspaceIsTrusted: true,
}

describe('resolveScssVarDefinition', () => {
  beforeEach(() => {
    fileTexts.clear()
    fileVersions.clear()
    existsMock.mockClear()
    readFileMock.mockClear()
    statMock.mockClear()
  })

  it('resolves local direct values, aliases, last definitions, and excludes declarations', async () => {
    const { resolveScssVarDefinition } =
      await import('../src/strategies/scss-vars')
    const text =
      '$base: #123456;\n$brand: red;\n$brand: $base;\na { color: $brand; }'
    const usage = text.lastIndexOf('$brand')

    await expect(
      resolveScssVarDefinition(text, text.indexOf('$brand') + 2, context),
    ).resolves.toBeNull()
    const target = await resolveScssVarDefinition(text, usage + 2, context)
    expect(target?.targetSelectionRange).toStrictEqual({ start: 0, end: 5 })
  })

  it.each([
    '$missing: $nope;\na { color: $missing; }',
    '$spacing: 1rem;\na { color: $spacing; }',
    '$a: $b;\n$b: $a;\na { color: $a; }',
  ])(
    'returns null for missing, non-color, or cyclic local values',
    async text => {
      const { resolveScssVarDefinition } =
        await import('../src/strategies/scss-vars')
      await expect(
        resolveScssVarDefinition(text, text.lastIndexOf('$') + 1, context),
      ).resolves.toBeNull()
    },
  )

  it('calculates the value range after the declaration delimiter', async () => {
    const { resolveScssVarDefinition } =
      await import('../src/strategies/scss-vars')
    const text = '$red:red;\na { color: $red; }'

    const target = await resolveScssVarDefinition(
      text,
      text.lastIndexOf('$red'),
      context,
    )

    expect(target?.targetRange).toStrictEqual({ start: 0, end: 8 })
  })

  it.each(['foo$brand', '$$brand'])(
    'rejects malformed token %s consistently with detection',
    async token => {
      const { findScssVars, resolveScssVarDefinition } =
        await import('../src/strategies/scss-vars')
      const text = `$brand: red;\na { color: ${token}; }`

      await expect(
        resolveScssVarDefinition(text, text.lastIndexOf('$brand') + 1, context),
      ).resolves.toBeNull()
      await expect(findScssVars(text, context)).resolves.toStrictEqual([])
    },
  )

  it.each([
    ['@use "tokens";\na { color: tokens.$brand; }', 'tokens.$brand'],
    ['@use "tokens" as theme;\na { color: theme.$brand; }', 'theme.$brand'],
    ['@use "tokens" as *;\na { color: $brand; }', '$brand'],
    ['@import "tokens";\na { color: $brand; }', '$brand'],
  ])('resolves module visibility for %s', async (entry, usageText) => {
    const { resolveScssVarDefinition } =
      await import('../src/strategies/scss-vars')
    const dependency = '$brand: #336699;\n'
    fileTexts.set('/workspace/_tokens.scss', dependency)

    await expect(
      resolveScssVarDefinition(entry, entry.indexOf(usageText) + 2, context),
    ).resolves.toMatchObject({
      targetFilePath: '/workspace/_tokens.scss',
      targetRange: { start: 0, end: 15 },
      targetSelectionRange: { start: 0, end: 6 },
    })
  })

  it('resolves forwarded partial index modules and cross-file aliases', async () => {
    const { resolveScssVarDefinition } =
      await import('../src/strategies/scss-vars')
    fileTexts.set('/workspace/tokens/_index.scss', '@forward "colors";\n')
    fileTexts.set(
      '/workspace/tokens/_colors.scss',
      '$base: #336699;\n$brand: $base;\n',
    )
    const entry = '@use "tokens";\na { color: tokens.$brand; }'

    const target = await resolveScssVarDefinition(
      entry,
      entry.indexOf('tokens.$brand') + 4,
      context,
    )

    expect(target).toMatchObject({
      targetFilePath: '/workspace/tokens/_colors.scss',
      targetSelectionRange: { start: 0, end: 5 },
    })
  })

  it.each([
    ['@use "index";\na { color: index.$brand; }', 'index.$brand'],
    ['@use "index" as *;\na { color: $brand; }', '$brand'],
  ])(
    'rejects conflicting forwarded exports through %s',
    async (entry, usageText) => {
      const { findScssVars, resolveScssVarDefinition } =
        await import('../src/strategies/scss-vars')
      fileTexts.set(
        '/workspace/_index.scss',
        '@forward "one";\n@forward "two";\n',
      )
      fileTexts.set('/workspace/_one.scss', '$brand: red;')
      fileTexts.set('/workspace/_two.scss', '$brand: blue;')

      await expect(findScssVars(entry, context)).resolves.toStrictEqual([])
      await expect(
        resolveScssVarDefinition(entry, entry.indexOf(usageText), context),
      ).resolves.toBeNull()
    },
  )

  it('rejects conflicting star exports for detection and navigation', async () => {
    const { findScssVars, resolveScssVarDefinition } =
      await import('../src/strategies/scss-vars')
    fileTexts.set('/workspace/_one.scss', '$brand: red;')
    fileTexts.set('/workspace/_two.scss', '$brand: blue;')
    const entry = '@use "one" as *;\n@use "two" as *;\na { color: $brand; }'

    await expect(findScssVars(entry, context)).resolves.toStrictEqual([])
    await expect(
      resolveScssVarDefinition(entry, entry.lastIndexOf('$brand'), context),
    ).resolves.toBeNull()
  })

  it.each([
    [
      '@use "one" as theme;\n@use "two" as theme;\na { color: theme.$brand; }',
      '/workspace/_one.scss',
      '/workspace/_two.scss',
    ],
    [
      '@use "a/tokens";\n@use "b/tokens";\na { color: tokens.$brand; }',
      '/workspace/a/_tokens.scss',
      '/workspace/b/_tokens.scss',
    ],
  ])(
    'rejects conflicting module namespaces for detection and navigation',
    async (entry, firstPath, secondPath) => {
      const { findScssVars, resolveScssVarDefinition } =
        await import('../src/strategies/scss-vars')
      fileTexts.set(firstPath, '$brand: red;')
      fileTexts.set(secondPath, '$brand: blue;')

      await expect(findScssVars(entry, context)).resolves.toStrictEqual([])
      await expect(
        resolveScssVarDefinition(
          entry,
          entry.lastIndexOf('theme.$brand') >= 0
            ? entry.lastIndexOf('theme.$brand')
            : entry.lastIndexOf('tokens.$brand'),
          context,
        ),
      ).resolves.toBeNull()
    },
  )

  it('resolves modules from configured load paths', async () => {
    const { resolveScssVarDefinition } =
      await import('../src/strategies/scss-vars')
    fileTexts.set('/styles/pkg/_index.scss', '$brand: #336699;')
    const entry = '@use "pkg";\na { color: pkg.$brand; }'

    const target = await resolveScssVarDefinition(
      entry,
      entry.indexOf('pkg.$brand'),
      {
        ...context,
        scssLoadPaths: ['/styles'],
      },
    )

    expect(target?.targetFilePath).toBe('/styles/pkg/_index.scss')
  })

  it('does not read modules when disabled or untrusted', async () => {
    const { resolveScssVarDefinition } =
      await import('../src/strategies/scss-vars')
    fileTexts.set('/workspace/_tokens.scss', '$brand: #336699;')
    const entry = '@use "tokens";\na { color: tokens.$brand; }'

    await expect(
      resolveScssVarDefinition(entry, entry.indexOf('tokens.$brand'), {
        ...context,
        resolveScssVariablesAcrossFiles: false,
      }),
    ).resolves.toBeNull()
    expect(existsMock).not.toHaveBeenCalled()
    expect(readFileMock).not.toHaveBeenCalled()
    expect(statMock).not.toHaveBeenCalled()
    await expect(
      resolveScssVarDefinition(entry, entry.indexOf('tokens.$brand'), {
        ...context,
        workspaceIsTrusted: false,
      }),
    ).resolves.toBeNull()
    expect(existsMock).not.toHaveBeenCalled()
    expect(readFileMock).not.toHaveBeenCalled()
    expect(statMock).not.toHaveBeenCalled()
  })

  it.each([
    ['unrelated text', 'a { color: red; }', 2],
    ['a CSS variable', 'a { color: var(--brand); }', 15],
  ])('does not read SCSS dependencies at %s', async (_, text, offset) => {
    const { resolveScssVarDefinition } =
      await import('../src/strategies/scss-vars')
    fileTexts.set('/workspace/_tokens.scss', '$brand: #336699;')
    const entry = `@use "tokens";\n${text}`

    await expect(
      resolveScssVarDefinition(entry, entry.indexOf(text) + offset, context),
    ).resolves.toBeNull()
    expect(existsMock).not.toHaveBeenCalled()
    expect(readFileMock).not.toHaveBeenCalled()
    expect(statMock).not.toHaveBeenCalled()
  })

  it.each(['detection', 'navigation'] as const)(
    'shares the 32-file limit across disjoint graphs during %s',
    async operation => {
      const { findScssVars, resolveScssVarDefinition } =
        await import('../src/strategies/scss-vars')
      const imports = Array.from(
        { length: 20 },
        (_, index) => `@import "import-${index}";`,
      )
      const starUses = Array.from(
        { length: 20 },
        (_, index) => `@use "star-${index}" as *;`,
      )
      const namespaceUses = Array.from(
        { length: 20 },
        (_, index) => `@use "module-${index}" as module-${index};`,
      )
      const entry = [
        ...imports,
        ...starUses,
        ...namespaceUses,
        'a { color: $star19; background: module-19.$brand; }',
      ].join('\n')

      for (let index = 0; index < 20; index += 1) {
        fileTexts.set(
          `/workspace/_import-${index}.scss`,
          `$import${index}: #111111;`,
        )
        fileTexts.set(
          `/workspace/_star-${index}.scss`,
          `$star${index}: #222222;`,
        )
        fileTexts.set(`/workspace/_module-${index}.scss`, '$brand: #333333;')
      }

      await (operation === 'detection'
        ? findScssVars(entry, context)
        : resolveScssVarDefinition(
            entry,
            entry.indexOf('$star19', entry.indexOf('a {')),
            context,
          ))

      expect(statMock).toHaveBeenCalledTimes(32)
      expect(
        new Set(statMock.mock.calls.map(([filePath]) => filePath)).size,
      ).toBe(32)
    },
  )

  it('keeps namespaced navigation aligned with detection at the shared budget boundary', async () => {
    const { findScssVars, resolveScssVarDefinition } =
      await import('../src/strategies/scss-vars')
    const imports = Array.from(
      { length: 16 },
      (_, index) => `@import "import-${index}";`,
    )
    const starUses = Array.from(
      { length: 8 },
      (_, index) => `@use "star-${index}" as *;`,
    )
    const entry = [
      ...imports,
      ...starUses,
      '@use "tokens" as theme;',
      'a { color: theme.$brand; }',
    ].join('\n')

    for (let index = 0; index < 16; index += 1) {
      fileTexts.set(
        `/workspace/_import-${index}.scss`,
        `$import${index}: #111111;`,
      )
    }
    for (let index = 0; index < 8; index += 1) {
      fileTexts.set(
        `/workspace/_star-${index}.scss`,
        `@forward "star-${index}-leaf";`,
      )
      fileTexts.set(
        `/workspace/_star-${index}-leaf.scss`,
        `$star${index}: #222222;`,
      )
    }
    fileTexts.set('/workspace/_tokens.scss', '$brand: #333333;')

    await expect(findScssVars(entry, context)).resolves.toStrictEqual([])
    expect(statMock).toHaveBeenCalledTimes(32)

    existsMock.mockClear()
    readFileMock.mockClear()
    statMock.mockClear()
    await expect(
      resolveScssVarDefinition(entry, entry.indexOf('theme.$brand'), context),
    ).resolves.toBeNull()
    expect(statMock).toHaveBeenCalledTimes(32)
  })

  it('uses changed unsaved dependency text and rejects cross-file cycles', async () => {
    const { resolveScssVarDefinition } =
      await import('../src/strategies/scss-vars')
    const entry = '@use "tokens";\na { color: tokens.$brand; }'
    fileTexts.set('/workspace/_tokens.scss', '$brand: 1rem;')
    fileVersions.set('/workspace/_tokens.scss', 1)
    await expect(
      resolveScssVarDefinition(entry, entry.indexOf('tokens.$brand'), context),
    ).resolves.toBeNull()

    fileTexts.set('/workspace/_tokens.scss', '$brand: #336699;')
    fileVersions.set('/workspace/_tokens.scss', 2)
    const target = await resolveScssVarDefinition(
      entry,
      entry.indexOf('tokens.$brand'),
      context,
    )
    expect(target?.targetFilePath).toBe('/workspace/_tokens.scss')

    fileTexts.set('/workspace/_tokens.scss', '@forward "more";')
    fileTexts.set('/workspace/_more.scss', '@forward "tokens";')
    fileVersions.set('/workspace/_tokens.scss', 3)
    await expect(
      resolveScssVarDefinition(entry, entry.indexOf('tokens.$brand'), context),
    ).resolves.toBeNull()
  })
})

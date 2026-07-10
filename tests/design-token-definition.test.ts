import { describe, expect, it, vi } from 'vitest'
import { resolveDesignTokenDefinition } from '../src/strategies/design-tokens/definition'
import { resolveDesignTokenColors } from '../src/strategies/design-tokens/external-loader'
import { parseJsonDesignTokenDocument } from '../src/strategies/design-tokens/json-document'
import { resolveLocalDesignTokenColors } from '../src/strategies/design-tokens/resolver'
import { parseYamlDesignTokenDocument } from '../src/strategies/design-tokens/yaml-document'
import type * as WorkspaceFileSystem from '../src/utils/workspace-file-system'

interface FileState {
  documentVersion?: number
  mtimeMs: number
  size: number
  text: string
}

const { files, readFileMock, statFileMock } = vi.hoisted(() => {
  const hoistedFiles = new Map<string, FileState>()
  return {
    files: hoistedFiles,
    readFileMock: vi.fn<(filePath: string) => Promise<string>>(filePath => {
      const file = hoistedFiles.get(filePath)
      if (!file) {
        throw new Error(`Missing file: ${filePath}`)
      }
      return Promise.resolve(file.text)
    }),
    statFileMock: vi.fn<(filePath: string) => Promise<FileState>>(filePath => {
      const file = hoistedFiles.get(filePath)
      if (!file) {
        throw new Error(`Missing file: ${filePath}`)
      }
      return Promise.resolve(file)
    }),
  }
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

const red = { colorSpace: 'srgb', components: [1, 0, 0] }

describe(resolveDesignTokenDefinition, () => {
  it.each([
    {
      name: 'JSON',
      parse: parseJsonDesignTokenDocument,
      text: JSON.stringify({
        colors: { red: { $type: 'color', $value: red } },
        semantic: {
          brand: { $value: '{colors.red}' },
          link: { $value: '{semantic.brand}' },
        },
      }),
      target: 'red',
      usage: '{semantic.brand}',
    },
    {
      name: 'JSONC',
      parse: parseJsonDesignTokenDocument,
      text: `{
        // token definitions
        "colors": { "red": { "$type": "color", "$value": ${JSON.stringify(red)} } },
        "semantic": { "link": { "$value": "{colors.red}" } },
      }`,
      target: 'red',
      usage: '{colors.red}',
    },
    {
      name: 'YAML',
      parse: parseYamlDesignTokenDocument,
      text: `colors:
  red:
    $type: color
    $value: { colorSpace: srgb, components: [1, 0, 0] }
semantic:
  brand:
    $value: '{colors.red}'
  link:
    $value: '{semantic.brand}'
`,
      target: 'red',
      usage: '{semantic.brand}',
    },
  ])('resolves chained $name curly aliases in $name', testCase => {
    const document = testCase.parse(testCase.text)!
    const usageStart = testCase.text.indexOf(testCase.usage)
    const targetStart = testCase.text.indexOf(testCase.target)

    const filePath = `/workspace/tokens.${testCase.name.toLowerCase()}`
    expect(
      resolveDesignTokenDefinition(document, usageStart + 2, { filePath }),
    ).toStrictEqual({
      originRange: {
        start: usageStart,
        end: usageStart + testCase.usage.length,
      },
      targetFilePath: filePath,
      targetRange: {
        start: targetStart,
        end: targetStart + testCase.target.length,
      },
      targetSelectionRange: {
        start: targetStart,
        end: targetStart + testCase.target.length,
      },
    })
  })

  it('requires a current file path for local definition targets', () => {
    const text = JSON.stringify({
      color: { $type: 'color', $value: red },
      alias: { $value: '{color}' },
    })
    const document = parseJsonDesignTokenDocument(text)!

    expect(
      resolveDesignTokenDefinition(document, text.indexOf('{color}')),
    ).toBeNull()
  })

  it('resolves local pointers, escaped segments, and $root tokens', () => {
    const text = JSON.stringify({
      'brand/colors': {
        '~red': { $type: 'color', $value: red },
      },
      group: {
        $root: { $type: 'color', $value: red },
      },
      escaped: {
        $type: 'color',
        $ref: '#/brand~1colors/~0red/$value',
      },
      rooted: { $ref: '#/group/$root/$value' },
    })
    const document = parseJsonDesignTokenDocument(text)!

    const options = { filePath: '/workspace/tokens.json' }
    const escaped = resolveDesignTokenDefinition(
      document,
      text.indexOf('#/brand') + 2,
      options,
    )
    expect(escaped).toMatchObject({
      targetSelectionRange: rangeOf(text, '~red'),
    })

    const rooted = resolveDesignTokenDefinition(
      document,
      text.indexOf('#/group') + 2,
      options,
    )
    expect(rooted).toMatchObject({
      targetSelectionRange: rangeOf(text, '$root'),
    })
  })

  it.each([
    {
      name: 'JSONC',
      parse: parseJsonDesignTokenDocument,
      text: `{
        // escaped pointer target
        "brand/colors": { "~red": { "$type": "color", "$value": ${JSON.stringify(red)} } },
        "group": { "$root": { "$type": "color", "$value": ${JSON.stringify(red)} } },
        "escaped": { "$ref": "#/brand~1colors/~0red/$value" },
        "rooted": { "$ref": "#/group/$root/$value" },
      }`,
    },
    {
      name: 'YAML',
      parse: parseYamlDesignTokenDocument,
      text: `'brand/colors':
  '~red':
    $type: color
    $value: { colorSpace: srgb, components: [1, 0, 0] }
group:
  $root:
    $type: color
    $value: { colorSpace: srgb, components: [1, 0, 0] }
escaped:
  $ref: '#/brand~1colors/~0red/$value'
rooted:
  $ref: '#/group/$root/$value'
`,
    },
  ])('captures escaped pointer and $root name ranges in $name', testCase => {
    const document = testCase.parse(testCase.text)!
    const options = {
      filePath: `/workspace/tokens.${testCase.name.toLowerCase()}`,
    }

    expect(
      resolveDesignTokenDefinition(
        document,
        testCase.text.indexOf('#/brand') + 2,
        options,
      ),
    ).toMatchObject({
      targetSelectionRange: rangeOf(testCase.text, '~red'),
    })
    expect(
      resolveDesignTokenDefinition(
        document,
        testCase.text.indexOf('#/group') + 2,
        options,
      ),
    ).toMatchObject({
      targetSelectionRange: rangeOf(testCase.text, '$root'),
    })
  })

  it.each([
    {
      name: 'JSON',
      text: `{
        "color": { "$type": "color", "$value": ${JSON.stringify(red)} },
        "color": { "$type": "color", "$value": ${JSON.stringify(red)} },
        "alias": { "$value": "{color}" },
        "pointer": { "$type": "color", "$ref": "#/color/$value" }
      }`,
    },
    {
      name: 'JSONC',
      text: `{
        "color": { "$type": "color", "$value": ${JSON.stringify(red)} },
        // duplicate semantic path is ambiguous
        "color": { "$type": "color", "$value": ${JSON.stringify(red)} },
        "alias": { "$value": "{color}" },
        "pointer": { "$type": "color", "$ref": "#/color/$value" },
      }`,
    },
  ])('rejects aliases to duplicate semantic paths in $name', testCase => {
    const document = parseJsonDesignTokenDocument(testCase.text)!
    const aliasStart = testCase.text.indexOf('{color}')
    const pointerStart = testCase.text.indexOf('#/color')
    const options = {
      filePath: `/workspace/tokens.${testCase.name.toLowerCase()}`,
    }

    expect(
      resolveDesignTokenDefinition(document, aliasStart, options),
    ).toBeNull()
    expect(
      resolveDesignTokenDefinition(document, pointerStart, options),
    ).toBeNull()
    expect(resolveLocalDesignTokenColors(document)).not.toContainEqual(
      expect.objectContaining({ start: aliasStart }),
    )
    expect(resolveLocalDesignTokenColors(document)).not.toContainEqual(
      expect.objectContaining({ start: pointerStart }),
    )
  })

  it('keeps YAML duplicate keys invalid', () => {
    expect(
      parseYamlDesignTokenDocument(`color:
  $type: color
  $value: red
color:
  $type: color
  $value: blue
`),
    ).toBeNull()
  })

  it('preserves typed raw-pointer fallback outside semantic token paths', () => {
    const text = JSON.stringify({
      $extensions: { palette: { $value: red } },
      alias: {
        $type: 'color',
        $ref: '#/$extensions/palette/$value',
      },
    })
    const document = parseJsonDesignTokenDocument(text)!

    expect(resolveLocalDesignTokenColors(document)).toMatchObject([
      { color: 'rgb(255, 0, 0)' },
    ])
  })

  it('keeps unnamed root tokens unnamed and named $root ranges precise', () => {
    const unnamedText = JSON.stringify({ $type: 'color', $value: red })
    const unnamed = parseJsonDesignTokenDocument(unnamedText)!
    const namedText = JSON.stringify({
      group: { $root: { $type: 'color', $value: red } },
    })
    const named = parseJsonDesignTokenDocument(namedText)!

    expect(unnamed.tokens[0]?.definitionRange).toBeUndefined()
    expect(named.tokens[0]?.definitionRange).toStrictEqual(
      rangeOf(namedText, '$root'),
    )
  })

  it('rejects concrete values, missing targets, non-colors, mismatches, and cycles', () => {
    const text = JSON.stringify({
      color: { $type: 'color', $value: red },
      dimension: { $type: 'dimension', $value: { value: 1, unit: 'px' } },
      concrete: { $type: 'color', $value: red },
      missing: { $value: '{no.such.token}' },
      nonColor: { $value: '{dimension}' },
      mismatch: { $type: 'dimension', $value: '{color}' },
      cycleA: { $value: '{cycleB}' },
      cycleB: { $value: '{cycleA}' },
    })
    const document = parseJsonDesignTokenDocument(text)!

    for (const expression of [
      JSON.stringify(red),
      '{no.such.token}',
      '{dimension}',
      '{color}',
      '{cycleB}',
    ]) {
      expect(
        resolveDesignTokenDefinition(document, text.indexOf(expression) + 1, {
          filePath: '/workspace/tokens.json',
        }),
      ).toBeNull()
    }
  })

  it('resolves trusted relative external JSON to YAML definitions', async () => {
    resetFiles()
    const dependency = `palette:
  brand:
    $type: color
    $value: { colorSpace: srgb, components: [1, 0, 0] }
`
    setFile('/workspace/palette.yaml', dependency)
    const text = JSON.stringify({
      brand: {
        $type: 'color',
        $ref: './palette.yaml#/palette/brand/$value',
      },
    })
    const document = parseJsonDesignTokenDocument(text)!

    await expect(
      resolveDesignTokenDefinition(document, text.indexOf('./palette'), {
        filePath: '/workspace/tokens.json',
        resolveDesignTokensAcrossFiles: true,
        workspaceIsTrusted: true,
      }),
    ).resolves.toMatchObject({
      targetFilePath: '/workspace/palette.yaml',
      targetSelectionRange: rangeOf(dependency, 'brand'),
    })
  })

  it('resolves trusted relative external YAML to JSON definitions', async () => {
    resetFiles()
    const dependency = JSON.stringify({
      brand: { $type: 'color', $value: red },
    })
    setFile('/workspace/palette.json', dependency)
    const text = `$type: color
$ref: './palette.json#/brand/$value'
`

    await expect(
      resolveDesignTokenDefinition(
        parseYamlDesignTokenDocument(text)!,
        text.indexOf('./palette'),
        {
          filePath: '/workspace/tokens.yaml',
          resolveDesignTokensAcrossFiles: true,
          workspaceIsTrusted: true,
        },
      ),
    ).resolves.toMatchObject({
      targetFilePath: '/workspace/palette.json',
      targetSelectionRange: rangeOf(dependency, 'brand'),
    })
  })

  it('rejects external cycles and final non-color tokens', async () => {
    resetFiles()
    setFile(
      '/workspace/a.yaml',
      `$ref: './b.json#/$value'
`,
    )
    setFile('/workspace/b.json', JSON.stringify({ $ref: './a.yaml#/$value' }))
    setFile(
      '/workspace/dimensions.json',
      JSON.stringify({
        spacing: {
          $type: 'dimension',
          $value: { value: 8, unit: 'px' },
        },
      }),
    )
    const options = {
      filePath: '/workspace/root.json',
      resolveDesignTokensAcrossFiles: true as const,
      workspaceIsTrusted: true,
    }

    for (const reference of [
      './a.yaml#/$value',
      './dimensions.json#/spacing/$value',
    ]) {
      const text = JSON.stringify({ alias: { $ref: reference } })
      await expect(
        resolveDesignTokenDefinition(
          parseJsonDesignTokenDocument(text)!,
          text.indexOf(reference),
          options,
        ),
      ).resolves.toBeNull()
    }
  })

  it('rejects typed references to duplicate external semantic paths', async () => {
    resetFiles()
    setFile(
      '/workspace/duplicate.jsonc',
      `{
        "color": { "$type": "color", "$value": ${JSON.stringify(red)} },
        // ambiguous duplicate
        "color": { "$type": "color", "$value": ${JSON.stringify(red)} },
      }`,
    )
    const text = JSON.stringify({
      alias: {
        $type: 'color',
        $ref: './duplicate.jsonc#/color/$value',
      },
    })
    const document = parseJsonDesignTokenDocument(text)!
    const filePath = '/workspace/tokens.json'

    await expect(
      resolveDesignTokenColors(document, { filePath }),
    ).resolves.toStrictEqual([])
    await expect(
      resolveDesignTokenDefinition(document, text.indexOf('./duplicate'), {
        filePath,
        resolveDesignTokensAcrossFiles: true,
        workspaceIsTrusted: true,
      }),
    ).resolves.toBeNull()
  })

  it('does not navigate to an unnamed external root token', async () => {
    resetFiles()
    setFile(
      '/workspace/root-token.yaml',
      `$type: color
$value: { colorSpace: srgb, components: [1, 0, 0] }
`,
    )
    const text = JSON.stringify({
      alias: { $ref: './root-token.yaml#/$value' },
    })

    await expect(
      resolveDesignTokenDefinition(
        parseJsonDesignTokenDocument(text)!,
        text.indexOf('./root-token'),
        {
          filePath: '/workspace/tokens.json',
          resolveDesignTokensAcrossFiles: true,
          workspaceIsTrusted: true,
        },
      ),
    ).resolves.toBeNull()
  })

  it('navigates to the exact name of an external named $root token', async () => {
    resetFiles()
    const dependency = `group:
  $root:
    $type: color
    $value: { colorSpace: srgb, components: [1, 0, 0] }
`
    setFile('/workspace/root-token.yaml', dependency)
    const text = JSON.stringify({
      alias: { $ref: './root-token.yaml#/group/$root/$value' },
    })

    await expect(
      resolveDesignTokenDefinition(
        parseJsonDesignTokenDocument(text)!,
        text.indexOf('./root-token'),
        {
          filePath: '/workspace/tokens.json',
          resolveDesignTokensAcrossFiles: true,
          workspaceIsTrusted: true,
        },
      ),
    ).resolves.toMatchObject({
      targetSelectionRange: rangeOf(dependency, '$root'),
    })
  })

  it('gates external reads by setting, trust, relative paths, and size', async () => {
    resetFiles()
    setFile('/workspace/palette.json', '{}', 524_289)

    for (const [reference, enabled, trusted] of [
      ['./palette.json#/brand/$value', false, true],
      ['./palette.json#/brand/$value', true, false],
      ['/workspace/palette.json#/brand/$value', true, true],
      ['./palette.json#/brand/$value', true, true],
    ] as const) {
      const text = JSON.stringify({
        alias: { $type: 'color', $ref: reference },
      })
      const document = parseJsonDesignTokenDocument(text)!
      const result = resolveDesignTokenDefinition(
        document,
        text.indexOf(reference),
        {
          filePath: '/workspace/root.json',
          resolveDesignTokensAcrossFiles: enabled,
          workspaceIsTrusted: trusted,
        },
      )
      const resolution = Promise.resolve(result)
      await expect(resolution).resolves.toBeNull()
    }

    expect(readFileMock).not.toHaveBeenCalled()
  })

  it('invalidates the shared external cache by document version', async () => {
    resetFiles()
    const dependencyPath = '/workspace/palette.json'
    const first = JSON.stringify({
      oldBrand: { $type: 'color', $value: red },
    })
    setFile(dependencyPath, first, undefined, 1)
    const root = JSON.stringify({
      alias: { $ref: './palette.json#/oldBrand/$value' },
    })
    const options = {
      filePath: '/workspace/root.json',
      resolveDesignTokensAcrossFiles: true as const,
      workspaceIsTrusted: true,
    }
    const rootDocument = parseJsonDesignTokenDocument(root)!

    await resolveDesignTokenDefinition(
      rootDocument,
      root.indexOf('./'),
      options,
    )
    await resolveDesignTokenDefinition(
      rootDocument,
      root.indexOf('./'),
      options,
    )
    expect(readFileMock).toHaveBeenCalledTimes(1)

    const second = JSON.stringify({
      newBrand: { $type: 'color', $value: red },
    })
    setFile(dependencyPath, second, undefined, 2)
    const changedRoot = root.replaceAll('oldBrand', 'newBrand')
    const resolved = await resolveDesignTokenDefinition(
      parseJsonDesignTokenDocument(changedRoot)!,
      changedRoot.indexOf('./'),
      options,
    )

    expect(readFileMock).toHaveBeenCalledTimes(2)
    expect(resolved).toMatchObject({
      targetSelectionRange: rangeOf(second, 'newBrand'),
    })
  })
})

function rangeOf(text: string, value: string) {
  const start = text.indexOf(value)
  return { start, end: start + value.length }
}

function resetFiles(): void {
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

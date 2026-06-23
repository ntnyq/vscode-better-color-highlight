import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findScssVars } from '../src/strategies/scss-vars'
import { FIXTURE_SCSS } from './fixtures'

describe(findScssVars, () => {
  it('finds SCSS variable usages with named-color values', async () => {
    const text = `
      $named-red: red;
      .cls { color: $named-red; }
    `
    const result = await findScssVars(text)
    expect(
      result.some(match => text.slice(match.start, match.end) === '$named-red'),
    ).toBe(true)
    expect(result.some(match => match.color === 'rgb(255, 0, 0)')).toBe(true)
  })

  it('does not highlight a partial variable name inside a new definition name', async () => {
    const text = `
      $red: #ff0000;
      $red2: $red;
      .cls { color: $red2; border-color: $red; }
    `
    const result = await findScssVars(text)
    expect(result.some(match => match.start === text.indexOf('$red2'))).toBe(
      false,
    )
    expect(
      result.some(match => match.start === text.lastIndexOf('$red2')),
    ).toBe(true)
  })

  it('resolves variables from @use namespaces', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'better-color-scss-'))
    const tokensPath = join(dir, '_tokens.scss')
    const entryPath = join(dir, 'entry.scss')

    await writeFile(tokensPath, '$brand: #336699;\n', 'utf8')

    const text = `
      @use "tokens";
      .button { color: tokens.$brand; }
    `
    await writeFile(entryPath, text, 'utf8')

    const result = await findScssVars(text, {
      languageId: 'scss',
      filePath: entryPath,
      resolveScssVariablesAcrossFiles: true,
    })

    expect(result).toStrictEqual([
      {
        start: text.indexOf('tokens.$brand'),
        end: text.indexOf('tokens.$brand') + 'tokens.$brand'.length,
        color: 'rgb(51, 102, 153)',
      },
    ])
  })

  it('resolves directory modules from partial index files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'better-color-scss-'))
    const componentsDir = join(dir, 'components')
    const indexPath = join(componentsDir, '_index.scss')
    const entryPath = join(dir, 'entry.scss')

    await mkdir(componentsDir, { recursive: true })
    await writeFile(indexPath, '$brand: #2563eb;\n', 'utf8')

    const text = `
      @use "components";
      .button { color: components.$brand; }
    `
    await writeFile(entryPath, text, 'utf8')

    const result = await findScssVars(text, {
      languageId: 'scss',
      filePath: entryPath,
      resolveScssVariablesAcrossFiles: true,
    })

    expect(result).toStrictEqual([
      {
        start: text.indexOf('components.$brand'),
        end: text.indexOf('components.$brand') + 'components.$brand'.length,
        color: 'rgb(37, 99, 235)',
      },
    ])
  })

  it('resolves @use modules with explicit aliases', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'better-color-scss-'))
    const themePath = join(dir, '_theme.scss')
    const entryPath = join(dir, 'entry.scss')

    await writeFile(themePath, '$brand: #dc2626;\n', 'utf8')

    const text = `
      @use "theme" as brand-theme;
      .button { color: brand-theme.$brand; }
    `
    await writeFile(entryPath, text, 'utf8')

    const result = await findScssVars(text, {
      languageId: 'scss',
      filePath: entryPath,
      resolveScssVariablesAcrossFiles: true,
    })

    expect(result).toStrictEqual([
      {
        start: text.indexOf('brand-theme.$brand'),
        end: text.indexOf('brand-theme.$brand') + 'brand-theme.$brand'.length,
        color: 'rgb(220, 38, 38)',
      },
    ])
  })

  it('resolves modules from configured SCSS load paths', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'better-color-scss-'))
    const loadPath = join(dir, 'styles')
    const entryPath = join(dir, 'src', 'entry.scss')
    const packageDir = join(loadPath, '@acme', 'tokens')
    const packageIndexPath = join(packageDir, '_index.scss')

    await mkdir(packageDir, { recursive: true })
    await mkdir(join(dir, 'src'), { recursive: true })
    await writeFile(packageIndexPath, '$brand: #0891b2;\n', 'utf8')

    const text = `
      @use "@acme/tokens" as acme;
      .button { color: acme.$brand; }
    `
    await writeFile(entryPath, text, 'utf8')

    const result = await findScssVars(text, {
      languageId: 'scss',
      filePath: entryPath,
      resolveScssVariablesAcrossFiles: true,
      scssLoadPaths: [loadPath],
    })

    expect(result).toStrictEqual([
      {
        start: text.indexOf('acme.$brand'),
        end: text.indexOf('acme.$brand') + 'acme.$brand'.length,
        color: 'rgb(8, 145, 178)',
      },
    ])
  })

  it('resolves package modules from nearest node_modules', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'better-color-scss-'))
    const packageDir = join(dir, 'node_modules', '@acme', 'tokens')
    const entryDir = join(dir, 'src', 'components')
    const entryPath = join(entryDir, 'entry.scss')
    const packageIndexPath = join(packageDir, '_index.scss')

    await mkdir(packageDir, { recursive: true })
    await mkdir(entryDir, { recursive: true })
    await writeFile(packageIndexPath, '$brand: #7c3aed;\n', 'utf8')

    const text = `
      @use "@acme/tokens";
      .button { color: tokens.$brand; }
    `
    await writeFile(entryPath, text, 'utf8')

    const result = await findScssVars(text, {
      languageId: 'scss',
      filePath: entryPath,
      resolveScssVariablesAcrossFiles: true,
    })

    expect(result).toStrictEqual([
      {
        start: text.indexOf('tokens.$brand'),
        end: text.indexOf('tokens.$brand') + 'tokens.$brand'.length,
        color: 'rgb(124, 58, 237)',
      },
    ])
  })

  it('does not resolve variables across files by default', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'better-color-scss-'))
    const tokensPath = join(dir, '_tokens.scss')
    const entryPath = join(dir, 'entry.scss')

    await writeFile(tokensPath, '$brand: #336699;\n', 'utf8')

    const text = `
      @use "tokens";
      .button { color: tokens.$brand; }
    `
    await writeFile(entryPath, text, 'utf8')

    const result = await findScssVars(text, {
      languageId: 'scss',
      filePath: entryPath,
    })

    expect(result).toStrictEqual([])
  })

  it('resolves variables from @use as star', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'better-color-scss-'))
    const tokensPath = join(dir, '_tokens.scss')
    const entryPath = join(dir, 'entry.scss')

    await writeFile(tokensPath, '$brand: #1d4ed8;\n', 'utf8')

    const text = `
      @use "tokens" as *;
      .button { color: $brand; }
    `
    await writeFile(entryPath, text, 'utf8')

    const result = await findScssVars(text, {
      languageId: 'scss',
      filePath: entryPath,
      resolveScssVariablesAcrossFiles: true,
    })

    expect(result).toStrictEqual([
      {
        start: text.indexOf('$brand', text.indexOf('.button')),
        end: text.indexOf('$brand', text.indexOf('.button')) + '$brand'.length,
        color: 'rgb(29, 78, 216)',
      },
    ])
  })

  it('resolves variables forwarded by used modules', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'better-color-scss-'))
    const tokensPath = join(dir, '_tokens.scss')
    const themePath = join(dir, '_theme.scss')
    const entryPath = join(dir, 'entry.scss')

    await writeFile(tokensPath, '$brand: #663399;\n', 'utf8')
    await writeFile(themePath, '@forward "tokens";\n', 'utf8')

    const text = `
      @use "theme";
      .button { color: theme.$brand; }
    `
    await writeFile(entryPath, text, 'utf8')

    const result = await findScssVars(text, {
      languageId: 'scss',
      filePath: entryPath,
      resolveScssVariablesAcrossFiles: true,
    })

    expect(result).toStrictEqual([
      {
        start: text.indexOf('theme.$brand'),
        end: text.indexOf('theme.$brand') + 'theme.$brand'.length,
        color: 'rgb(102, 51, 153)',
      },
    ])
  })

  it('resolves variables from legacy @import files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'better-color-scss-'))
    const tokensPath = join(dir, '_tokens.scss')
    const entryPath = join(dir, 'entry.scss')

    await writeFile(tokensPath, '$brand: #0f766e;\n', 'utf8')

    const text = `
      @import "tokens";
      .button { color: $brand; }
    `
    await writeFile(entryPath, text, 'utf8')

    const result = await findScssVars(text, {
      languageId: 'scss',
      filePath: entryPath,
      resolveScssVariablesAcrossFiles: true,
    })

    expect(result).toStrictEqual([
      {
        start: text.indexOf('$brand', text.indexOf('.button')),
        end: text.indexOf('$brand', text.indexOf('.button')) + '$brand'.length,
        color: 'rgb(15, 118, 110)',
      },
    ])
  })

  it('stops resolving safely when forwarded modules form a cycle', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'better-color-scss-'))
    const aPath = join(dir, '_a.scss')
    const bPath = join(dir, '_b.scss')
    const entryPath = join(dir, 'entry.scss')

    await writeFile(aPath, '@forward "b";\n$a: #7c2d12;\n', 'utf8')
    await writeFile(bPath, '@forward "a";\n$b: #14532d;\n', 'utf8')

    const text = `
      @use "a";
      .button {
        color: a.$a;
        background: a.$b;
      }
    `
    await writeFile(entryPath, text, 'utf8')

    const result = await findScssVars(text, {
      languageId: 'scss',
      filePath: entryPath,
      resolveScssVariablesAcrossFiles: true,
    })

    expect(result).toStrictEqual([
      {
        start: text.indexOf('a.$a'),
        end: text.indexOf('a.$a') + 'a.$a'.length,
        color: 'rgb(124, 45, 18)',
      },
      {
        start: text.indexOf('a.$b'),
        end: text.indexOf('a.$b') + 'a.$b'.length,
        color: 'rgb(20, 83, 45)',
      },
    ])
  })

  it('skips missing @use modules without failing the run', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'better-color-scss-'))
    const entryPath = join(dir, 'entry.scss')

    const text = `
      @use "missing";
      .button { color: missing.$brand; }
    `
    await writeFile(entryPath, text, 'utf8')

    const result = await findScssVars(text, {
      languageId: 'scss',
      filePath: entryPath,
      resolveScssVariablesAcrossFiles: true,
    })

    expect(result).toStrictEqual([])
  })

  it('handles duplicate imports and forwards without duplicate matches', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'better-color-scss-'))
    const tokensPath = join(dir, '_tokens.scss')
    const themePath = join(dir, '_theme.scss')
    const entryPath = join(dir, 'entry.scss')

    await writeFile(tokensPath, '$brand: #be123c;\n', 'utf8')
    await writeFile(
      themePath,
      '@forward "tokens";\n@forward "tokens";\n',
      'utf8',
    )

    const text = `
      @import "tokens";
      @import "tokens";
      @use "theme";
      .button {
        color: $brand;
        background: theme.$brand;
      }
    `
    await writeFile(entryPath, text, 'utf8')

    const result = await findScssVars(text, {
      languageId: 'scss',
      filePath: entryPath,
      resolveScssVariablesAcrossFiles: true,
    })

    expect(result).toStrictEqual([
      {
        start: text.indexOf('$brand', text.indexOf('color')),
        end: text.indexOf('$brand', text.indexOf('color')) + '$brand'.length,
        color: 'rgb(190, 18, 60)',
      },
      {
        start: text.indexOf('theme.$brand'),
        end: text.indexOf('theme.$brand') + 'theme.$brand'.length,
        color: 'rgb(190, 18, 60)',
      },
    ])
  })

  it('stops resolving forwarded modules at the configured depth limit', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'better-color-scss-'))
    const entryPath = join(dir, 'entry.scss')

    await writeFile(join(dir, '_a.scss'), '@forward "b";\n', 'utf8')
    await writeFile(join(dir, '_b.scss'), '@forward "c";\n', 'utf8')
    await writeFile(join(dir, '_c.scss'), '@forward "d";\n', 'utf8')
    await writeFile(join(dir, '_d.scss'), '@forward "e";\n', 'utf8')
    await writeFile(
      join(dir, '_e.scss'),
      '@forward "f";\n$near: #047857;\n',
      'utf8',
    )
    await writeFile(join(dir, '_f.scss'), '$too-deep: #ef4444;\n', 'utf8')

    const text = `
      @use "a";
      .button {
        color: a.$near;
        background: a.$too-deep;
      }
    `
    await writeFile(entryPath, text, 'utf8')

    const result = await findScssVars(text, {
      languageId: 'scss',
      filePath: entryPath,
      resolveScssVariablesAcrossFiles: true,
    })

    expect(result).toStrictEqual([
      {
        start: text.indexOf('a.$near'),
        end: text.indexOf('a.$near') + 'a.$near'.length,
        color: 'rgb(4, 120, 87)',
      },
    ])
  })

  it('stops resolving modules after the per-run file limit', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'better-color-scss-'))
    const entryPath = join(dir, 'entry.scss')
    const moduleCount = 34

    await Promise.all(
      Array.from({ length: moduleCount }, async (_, index) => {
        const hex = index.toString(16).padStart(2, '0')
        await writeFile(
          join(dir, `_m${index}.scss`),
          `$v${index}: #${hex}${hex}${hex};\n`,
          'utf8',
        )
      }),
    )

    const text = `
      ${Array.from({ length: moduleCount }, (_, index) => `@use "m${index}" as *;`).join('\n')}
      .button {
        color: $v0;
        border-color: $v31;
        background: $v32;
      }
    `
    await writeFile(entryPath, text, 'utf8')

    const result = await findScssVars(text, {
      languageId: 'scss',
      filePath: entryPath,
      resolveScssVariablesAcrossFiles: true,
    })

    expect(result).toStrictEqual([
      {
        start: text.indexOf('$v0'),
        end: text.indexOf('$v0') + '$v0'.length,
        color: 'rgb(0, 0, 0)',
      },
      {
        start: text.indexOf('$v31'),
        end: text.indexOf('$v31') + '$v31'.length,
        color: 'rgb(31, 31, 31)',
      },
    ])
  })

  it('matches the expected playground SCSS variable usages without false property hits', async () => {
    const result = await findScssVars(FIXTURE_SCSS)
    const usages = result.map(match =>
      FIXTURE_SCSS.slice(match.start, match.end),
    )

    const expectedUsages = [
      '$hex-6',
      '$rgb-comma',
      '$hsl-comma',
      '$named-red',
      '$hex-8',
      '$hwb',
      '$oklch',
      '$hex-4',
      '$root-red',
      '$root-red-2',
      '$root-panel',
      '$local-border',
      '$local-bg',
      '$red2',
      '$red-long',
      '$red',
      '$display-p3-accent',
      '$rec2020-accent',
      '$prophoto-accent',
    ]

    const actualUniqueUsages = [
      ...new Set(usages.filter(usageText => usageText.startsWith('$'))),
    ]
    const missingUsages = expectedUsages.filter(
      usage => !actualUniqueUsages.includes(usage),
    )
    const falsePropertyHits = usages.filter(usage =>
      ['color', 'background', 'border-color', 'outline-color'].includes(usage),
    )

    expect(expectedUsages).toHaveLength(19)
    expect(actualUniqueUsages).toStrictEqual(
      expect.arrayContaining(expectedUsages),
    )
    expect(missingUsages).toStrictEqual([])
    expect(falsePropertyHits).toStrictEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import { findAnsiSgrColors } from '../src/engine/strategies/ansi-sgr'

describe(findAnsiSgrColors, () => {
  it('detects a standard ANSI foreground color', () => {
    const text = String.raw`error: \x1b[31mfailed\x1b[0m`

    expect(findAnsiSgrColors(text, { languageId: 'plaintext' })).toStrictEqual([
      {
        start: text.indexOf(String.raw`\x1b[31m`),
        end: text.indexOf(String.raw`\x1b[31m`) + String.raw`\x1b[31m`.length,
        color: 'rgb(205, 0, 0)',
        editMode: 'read-only',
      },
    ])
  })

  it.each([
    ['0', 'rgb(0, 0, 0)'],
    ['16', 'rgb(0, 0, 0)'],
    ['231', 'rgb(255, 255, 255)'],
    ['232', 'rgb(8, 8, 8)'],
    ['255', 'rgb(238, 238, 238)'],
  ])('resolves indexed ANSI color %s', (index, color) => {
    const text = String.raw`\x1b[38;5;${index}m`

    expect(findAnsiSgrColors(text, { languageId: 'plaintext' })).toStrictEqual([
      {
        start: 0,
        end: text.length,
        color,
        editMode: 'read-only',
      },
    ])
  })

  it.each([
    ['30', 'rgb(0, 0, 0)'],
    ['37', 'rgb(229, 229, 229)'],
    ['40', 'rgb(0, 0, 0)'],
    ['47', 'rgb(229, 229, 229)'],
    ['90', 'rgb(127, 127, 127)'],
    ['97', 'rgb(255, 255, 255)'],
    ['100', 'rgb(127, 127, 127)'],
    ['107', 'rgb(255, 255, 255)'],
  ])('resolves basic ANSI range boundary %s', (parameter, color) => {
    const text = String.raw`\x1b[${parameter}m`

    expect(findAnsiSgrColors(text, { languageId: 'plaintext' })).toStrictEqual([
      {
        start: 0,
        end: text.length,
        color,
        editMode: 'read-only',
      },
    ])
  })

  it.each(['38', '48'])('resolves truecolor SGR %s sequences', selector => {
    const text = String.raw`\x1b[${selector};2;57;197;187m`

    expect(findAnsiSgrColors(text, { languageId: 'typescript' })).toStrictEqual(
      [
        {
          start: 0,
          end: text.length,
          color: 'rgb(57, 197, 187)',
          editMode: 'read-only',
        },
      ],
    )
  })

  it.each([
    String.raw`\x1B[32m`,
    String.raw`\u001b[32m`,
    String.raw`\u{1b}[32m`,
    String.raw`\033[32m`,
    String.raw`\e[32m`,
    '\u001B[32m',
  ])('recognizes the ANSI escape introducer in %j', text => {
    expect(
      findAnsiSgrColors(text, { languageId: 'shellscript' }),
    ).toStrictEqual([
      {
        start: 0,
        end: text.length,
        color: 'rgb(0, 205, 0)',
        editMode: 'read-only',
      },
    ])
  })

  it.each([
    [String.raw`\x1b[38:5:21m`, 'rgb(0, 0, 255)'],
    [String.raw`\x1b[48:2::57:197:187m`, 'rgb(57, 197, 187)'],
    [String.raw`\x1b[38:2:0:57:197:187m`, 'rgb(57, 197, 187)'],
  ])('supports colon-delimited SGR subparameters in %s', (text, color) => {
    expect(findAnsiSgrColors(text, { languageId: 'typescript' })).toStrictEqual(
      [
        {
          start: 0,
          end: text.length,
          color,
          editMode: 'read-only',
        },
      ],
    )
  })

  it.each([
    ['1;31', 'rgb(205, 0, 0)'],
    ['31;44', 'rgb(0, 0, 238)'],
    ['44;31', 'rgb(0, 0, 238)'],
    ['31;39', null],
    ['44;49', null],
    ['1;31;48;5;21', 'rgb(0, 0, 255)'],
  ])(
    'resolves the effective color from SGR parameters %s',
    (parameters, color) => {
      const text = String.raw`\x1b[${parameters}m`
      const matches = findAnsiSgrColors(text, { languageId: 'plaintext' })

      expect(matches).toStrictEqual(
        color
          ? [
              {
                start: 0,
                end: text.length,
                color,
                editMode: 'read-only',
              },
            ]
          : [],
      )
    },
  )

  it('applies a custom base palette to basic and indexed colors', () => {
    const basic = String.raw`\x1b[31m`
    const indexed = String.raw`\x1b[38;5;1m`
    const text = `${basic} ${indexed}`

    expect(
      findAnsiSgrColors(text, {
        ansiPalette: { red: '#123456' },
        languageId: 'plaintext',
      }),
    ).toStrictEqual([
      {
        start: 0,
        end: basic.length,
        color: 'rgb(18, 52, 86)',
        editMode: 'read-only',
      },
      {
        start: basic.length + 1,
        end: text.length,
        color: 'rgb(18, 52, 86)',
        editMode: 'read-only',
      },
    ])
  })

  it.each([
    String.raw`\\x1b[31m`,
    String.raw`\x1b[38;5;m`,
    String.raw`\x1b[38;2;;0;31m`,
    String.raw`\x1b[38:5:m`,
    String.raw`\x1b[38:2::57::187m`,
    String.raw`\x1b[38;5;256m`,
    String.raw`\x1b[38;2;999;0;31m`,
    String.raw`\x1b[39m`,
    String.raw`\x1b[31`,
    String.raw`\x1b[31K`,
  ])('ignores invalid or non-color ANSI source %j', text => {
    expect(findAnsiSgrColors(text, { languageId: 'plaintext' })).toStrictEqual(
      [],
    )
  })
})

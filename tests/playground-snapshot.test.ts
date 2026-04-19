import { readdir, readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getStrategies } from '../src/core/strategy-registry'
import type { ColorMatch } from '../src/core/types'
import { buildDecorationOptions } from '../src/decorations/marker-types'
import type { NestedScopedConfigs } from '../src/meta'

const PLAYGROUND_DIR = join(process.cwd(), 'playground')
const SNAPSHOT_DIR = join(process.cwd(), 'tests', '__snapshots__', 'playground')

const EXTENSION_LANGUAGE_MAP = new Map<string, string>([
  ['.css', 'css'],
  ['.scss', 'scss'],
  ['.less', 'less'],
  ['.styl', 'stylus'],
  ['.html', 'html'],
  ['.ts', 'typescript'],
])

const snapshotConfig: NestedScopedConfigs = {
  enable: true,
  languages: ['*'],
  matchWords: true,
  useARGB: false,
  matchRgbWithNoFunction: true,
  rgbWithNoFunctionLanguages: ['*'],
  matchHslWithNoFunction: true,
  hslWithNoFunctionLanguages: ['*'],
  markerType: 'background',
  markRuler: true,
  debug: false,
}

function getLanguageId(fileName: string): string {
  return EXTENSION_LANGUAGE_MAP.get(extname(fileName)) ?? 'plaintext'
}

function getSnapshotPath(fileName: string): string {
  return join(SNAPSHOT_DIR, `${fileName}.snap`)
}

function getLineColumn(text: string, offset: number) {
  const before = text.slice(0, offset)
  const lines = before.split('\n')
  return {
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1,
  }
}

function dedupeAndSortMatches(matches: ColorMatch[]) {
  const seen = new Set<string>()

  return [...matches]
    .sort(
      (a, b) =>
        a.start - b.start || a.end - b.end || a.color.localeCompare(b.color),
    )
    .filter(match => {
      const key = `${match.start}:${match.end}:${match.color}`
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
}

async function collectFileSnapshot(fileName: string) {
  const filePath = join(PLAYGROUND_DIR, fileName)
  const text = await readFile(filePath, 'utf8')
  const languageId = getLanguageId(fileName)
  const strategies = getStrategies(languageId, snapshotConfig)

  const results = await Promise.all(
    strategies.map(strategy => strategy(text, { languageId, filePath })),
  )

  const matches = dedupeAndSortMatches(results.flat())

  return {
    file: fileName,
    languageId,
    strategyNames: strategies.map(strategy => strategy.name || 'anonymous'),
    matches: matches.map((match, index) => {
      const location = getLineColumn(text, match.start)
      const render = buildDecorationOptions(
        snapshotConfig.markerType,
        match.color,
        snapshotConfig.markRuler,
      )

      return {
        index,
        line: location.line,
        column: location.column,
        text: text.slice(match.start, match.end),
        range: [match.start, match.end],
        color: match.color,
        render: {
          backgroundColor: render.backgroundColor ?? null,
          color: render.color ?? null,
          border: render.border ?? null,
          overviewRulerColor: render.overviewRulerColor ?? null,
        },
      }
    }),
  }
}

describe('playground color snapshots', () => {
  it('matches and renders colors for every playground sample file', async () => {
    const entries = await readdir(PLAYGROUND_DIR, { withFileTypes: true })
    const files = entries
      .filter(entry => entry.isFile())
      .map(entry => entry.name)
      .filter(name => name !== 'package.json')
      .sort((a, b) => a.localeCompare(b))

    for (const fileName of files) {
      const snapshot = await collectFileSnapshot(fileName)
      await expect(JSON.stringify(snapshot, null, 2)).toMatchFileSnapshot(
        getSnapshotPath(fileName),
      )
    }
  })
})

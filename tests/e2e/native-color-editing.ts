import {
  Color,
  ConfigurationTarget,
  Range,
  Uri,
  WorkspaceEdit,
  commands,
  languages,
  window,
  workspace,
} from 'vscode'
import type {
  ColorInformation,
  ColorPresentation,
  Hover,
  TextDocument,
} from 'vscode'
import { assertCondition, assertEqual, waitForConfigValue } from './shared.ts'

const CONFIG_SECTION = 'color-highlight'
const ALPHA_COMMAND = 'color-highlight.adjustColorAlpha'
const EDITING_SETTINGS = ['enableColorPicker', 'enableHover'] as const

interface NativeColorFixture {
  readonly name: string
  readonly languageId: string
  readonly source: string
  readonly afterPicker: string
  readonly afterAlpha: string
  readonly byteAlpha?: boolean
}

const NATIVE_COLOR_FIXTURES: readonly NativeColorFixture[] = [
  {
    name: 'Compose packed ARGB with integer suffix',
    languageId: 'kotlin',
    source: 'Color( 0xFFFF0000UL )',
    afterPicker: 'Color( 0x8000FF00UL )',
    afterAlpha: 'Color( 0x6700FF00UL )',
    byteAlpha: true,
  },
  {
    name: 'Compose named floats with comments and trailing comma',
    languageId: 'kotlin',
    source: 'Color(blue = 0F, /* brand */ red = 1F, green = 0F, alpha = 1F,)',
    afterPicker:
      'Color(blue = 0F, /* brand */ red = 0F, green = 1F, alpha = 0.5F,)',
    afterAlpha:
      'Color(blue = 0F, /* brand */ red = 0F, green = 1F, alpha = 0.4F,)',
  },
  {
    name: 'Compose alpha insertion before a line comment',
    languageId: 'kotlin',
    source: 'Color(1f, 0f, 0f // keep the closing parenthesis\n)',
    afterPicker: 'Color(0f, 1f, 0f, 0.5f // keep the closing parenthesis\n)',
    afterAlpha: 'Color(0f, 1f, 0f, 0.4f // keep the closing parenthesis\n)',
  },
  {
    name: 'Compose HSL',
    languageId: 'kotlin',
    source: 'Color.hsl(0f, 1f, 0.5f)',
    afterPicker: 'Color.hsl(120f, 1f, 0.5f, 0.5f)',
    afterAlpha: 'Color.hsl(120f, 1f, 0.5f, 0.4f)',
  },
  {
    name: 'Compose named HSV',
    languageId: 'kotlin',
    source: 'Color.hsv(hue = 0f, saturation = 1f, value = 1f)',
    afterPicker:
      'Color.hsv(hue = 120f, saturation = 1f, value = 1f, alpha = 0.5f)',
    afterAlpha:
      'Color.hsv(hue = 120f, saturation = 1f, value = 1f, alpha = 0.4f)',
  },
  {
    name: 'Android Java RGB to ARGB',
    languageId: 'java',
    source: 'android.graphics.Color.rgb(255, /* green */ 0, 0 // blue\n)',
    afterPicker:
      'android.graphics.Color.argb(128, 0, /* green */ 255, 0 // blue\n)',
    afterAlpha:
      'android.graphics.Color.argb(103, 0, /* green */ 255, 0 // blue\n)',
    byteAlpha: true,
  },
  {
    name: 'Android Java float RGB to ARGB',
    languageId: 'java',
    source: 'android.graphics.Color.rgb (/* red */ 1F, 0F, 0F)',
    afterPicker: 'android.graphics.Color.argb (0.5F, /* red */ 0F, 1F, 0F)',
    afterAlpha: 'android.graphics.Color.argb (0.4F, /* red */ 0F, 1F, 0F)',
  },
  {
    name: 'Android Kotlin parseColor',
    languageId: 'kotlin',
    source: 'Color.parseColor("#FFFF0000")',
    afterPicker: 'Color.parseColor("#8000FF00")',
    afterAlpha: 'Color.parseColor("#6700FF00")',
    byteAlpha: true,
  },
  {
    name: 'Android XML alpha-first resource',
    languageId: 'xml',
    source: '#FFFF0000',
    afterPicker: '#8000FF00',
    afterAlpha: '#6700FF00',
    byteAlpha: true,
  },
  {
    name: 'SwiftUI explicit color space and opacity insertion',
    languageId: 'swift',
    source: 'SwiftUI.Color(.sRGB, red: 1, /* brand */ green: 0, blue: 0)',
    afterPicker:
      'SwiftUI.Color(.sRGB, red: 0, /* brand */ green: 1, blue: 0, opacity: 0.5)',
    afterAlpha:
      'SwiftUI.Color(.sRGB, red: 0, /* brand */ green: 1, blue: 0, opacity: 0.4)',
  },
  {
    name: 'UIKit alpha and comments',
    languageId: 'swift',
    source: 'UIKit.UIColor(red: 1, green: 0, /* brand */ blue: 0, alpha: 1)',
    afterPicker:
      'UIKit.UIColor(red: 0, green: 1, /* brand */ blue: 0, alpha: 0.5)',
    afterAlpha:
      'UIKit.UIColor(red: 0, green: 1, /* brand */ blue: 0, alpha: 0.4)',
  },
]

/**
 * Exercise registered picker and hover providers plus actual document edits
 * in both desktop and Web hosts, restoring settings even when a check fails.
 */
export async function assertNativeColorEditing(): Promise<void> {
  const config = workspace.getConfiguration(CONFIG_SECTION)
  const previousSettings = EDITING_SETTINGS.map(key => ({
    key,
    globalValue: config.inspect<boolean>(key)?.globalValue,
    effectiveValue: config.get<boolean>(key, false),
  }))

  try {
    for (const key of EDITING_SETTINGS) {
      await config.update(key, true, ConfigurationTarget.Global)
      await waitForConfigValue(key, true)
    }

    for (const fixture of NATIVE_COLOR_FIXTURES) {
      await assertNativeColorFixture(fixture)
    }
  } finally {
    for (const { key, globalValue, effectiveValue } of previousSettings) {
      await config.update(key, globalValue, ConfigurationTarget.Global)
      await waitForConfigValue(key, effectiveValue)
    }
  }
}

/**
 * Check exact source ranges, source-preserving edits, and stale hover actions.
 */
async function assertNativeColorFixture(
  fixture: NativeColorFixture,
): Promise<void> {
  const isXml = fixture.languageId === 'xml'
  let declaration = 'val'
  if (fixture.languageId === 'swift') {
    declaration = 'let'
  } else if (fixture.languageId === 'java') {
    declaration = 'int'
  }
  const prefix = isXml
    ? '<resources>\n  <!-- 前置 🎨 -->\n  <color name="brand">'
    : `// 前置 🎨\n${declaration} brand = `
  const suffix = isXml ? '</color>\n</resources>\n' : '; // keep this suffix\n'
  // The Android resolver needs a resource path; an untitled URI stays editable
  // in the browser without depending on local disk or a filesystem mock.
  const document = isXml
    ? await workspace.openTextDocument(
        Uri.from({
          scheme: 'untitled',
          path: '/native-color-e2e/res/values/colors.xml',
        }),
      )
    : await workspace.openTextDocument({ language: fixture.languageId })
  await languages.setTextDocumentLanguage(document, fixture.languageId)
  const editor = await window.showTextDocument(document)

  try {
    assertEqual(document.languageId, fixture.languageId, fixture.name)
    assertCondition(
      await editor.edit(builder => {
        builder.insert(document.positionAt(0), prefix + fixture.source + suffix)
      }),
      `${fixture.name}: expected fixture insertion`,
    )
    const original = await assertDocumentColor(
      document,
      fixture.source,
      prefix.length,
      new Color(1, 0, 0, 1),
    )
    const staleAlphaPayload = await getAlphaDecrementPayload(document, original)
    const presentations = await commands.executeCommand<ColorPresentation[]>(
      'vscode.executeColorPresentationProvider',
      new Color(0, 1, 0, 0.5),
      { uri: document.uri, range: original.range },
    )
    assertEqual(presentations?.length, 1, `${fixture.name}: one native edit`)
    const [presentation] = presentations
    assertEqual(presentation.label, fixture.afterPicker, fixture.name)
    assertCondition(
      presentation.textEdit,
      `${fixture.name}: expected text edit`,
    )
    assertCondition(
      presentation.textEdit.range.isEqual(original.range),
      `${fixture.name}: picker must replace the complete color expression`,
    )
    assertEqual(
      presentation.additionalTextEdits?.length ?? 0,
      0,
      `${fixture.name}: no edits outside the color`,
    )
    const edit = new WorkspaceEdit()
    edit.set(document.uri, [presentation.textEdit])
    assertCondition(await workspace.applyEdit(edit), fixture.name)
    const afterPicker = prefix + fixture.afterPicker + suffix
    assertEqual(document.getText(), afterPicker, fixture.name)

    await commands.executeCommand(ALPHA_COMMAND, staleAlphaPayload)
    assertEqual(document.getText(), afterPicker, `${fixture.name}: stale hover`)

    const picked = await assertDocumentColor(
      document,
      fixture.afterPicker,
      prefix.length,
      new Color(0, 1, 0, 0.5),
    )
    const alphaPayload = await getAlphaDecrementPayload(document, picked)
    await commands.executeCommand(ALPHA_COMMAND, alphaPayload)
    const afterAlpha = prefix + fixture.afterAlpha + suffix
    assertEqual(document.getText(), afterAlpha, fixture.name)
    await assertDocumentColor(
      document,
      fixture.afterAlpha,
      prefix.length,
      // A stored 50% byte is 128; subtracting 10% rounds 102.5 to 103.
      new Color(0, 1, 0, fixture.byteAlpha ? 103 / 255 : 0.4),
    )

    await commands.executeCommand(ALPHA_COMMAND, alphaPayload)
    assertEqual(
      document.getText(),
      afterAlpha,
      `${fixture.name}: repeated hover`,
    )
  } finally {
    await window.showTextDocument(document)
    await commands.executeCommand('workbench.action.revertAndCloseActiveEditor')
  }
}

/**
 * Read native colors through VS Code and assert full UTF-16 source ranges and
 * normalized channels, allowing the documented byte-alpha rounding.
 */
async function assertDocumentColor(
  document: TextDocument,
  source: string,
  start: number,
  expected: Color,
): Promise<ColorInformation> {
  const colors = await commands.executeCommand<ColorInformation[]>(
    'vscode.executeDocumentColorProvider',
    document.uri,
  )
  assertEqual(colors?.length, 1, `${source}: one document color`)
  const [color] = colors
  const expectedRange = new Range(
    document.positionAt(start),
    document.positionAt(start + source.length),
  )
  assertCondition(
    color.range.isEqual(expectedRange),
    `${source}: exact source range`,
  )
  assertEqual(
    document.getText(color.range),
    source,
    'Expected full source text',
  )
  for (const channel of ['red', 'green', 'blue', 'alpha'] as const) {
    assertCondition(
      Math.abs(color.color[channel] - expected[channel]) <=
        0.002 + Number.EPSILON,
      `${source}: ${channel} expected ${expected[channel]}, received ${color.color[channel]}`,
    )
  }
  return color
}

/**
 * Use the payload produced by the real hover provider, including source kind
 * and offset metadata, instead of manufacturing command arguments in tests.
 */
async function getAlphaDecrementPayload(
  document: TextDocument,
  color: ColorInformation,
): Promise<unknown> {
  const hovers = await commands.executeCommand<Hover[]>(
    'vscode.executeHoverProvider',
    document.uri,
    color.range.start,
  )
  for (const hover of hovers ?? []) {
    for (const content of hover.contents) {
      const markdown = typeof content === 'string' ? content : content.value
      if (!markdown.includes('**Color Highlight**')) {
        continue
      }
      assertCondition(
        hover.range?.isEqual(color.range),
        `Expected full hover range for ${document.getText(color.range)}; received ${JSON.stringify(hover.range)}, expected ${JSON.stringify(color.range)}`,
      )
      assertCondition(
        !markdown.includes('command:color-highlight.replaceColorAs'),
        'Native hover must only offer source-preserving editing actions',
      )
      const encoded = markdown.match(
        /command:color-highlight\.adjustColorAlpha\?(?<args>\S+)\)/u,
      )?.groups?.args
      assertCondition(encoded, 'Expected an alpha decrement command link')
      const args: unknown = JSON.parse(decodeURIComponent(encoded))
      assertCondition(
        Array.isArray(args) && args.length === 1,
        'Expected one argument',
      )
      const payload: unknown = args[0]
      assertCondition(
        typeof payload === 'object' && payload !== null && 'delta' in payload,
        'Expected an alpha command payload',
      )
      assertEqual(payload.delta, -0.1, 'Expected alpha decrement')
      return payload
    }
  }
  throw new Error(`Missing native color hover for ${document.uri.toString()}`)
}

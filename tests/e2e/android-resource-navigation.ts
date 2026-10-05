import {
  commands,
  ConfigurationTarget,
  languages,
  Range,
  Uri,
  window,
  workspace,
} from 'vscode'
import type { LocationLink, TextDocument } from 'vscode'
import { assertCondition, assertEqual, waitForConfigValue } from './shared.ts'

/**
 * Exercise resource discovery and definition links using the host filesystem:
 * local files on desktop and the test server's virtual filesystem on Web.
 */
export async function assertAndroidResourceNavigation(): Promise<void> {
  const folder = workspace.workspaceFolders?.[0]
  assertCondition(folder, 'Android navigation requires a test workspace')
  assertCondition(workspace.isTrusted, 'Expected a trusted test workspace')
  const root = Uri.joinPath(folder.uri, `.android-navigation-e2e-${Date.now()}`)
  const colorsUri = Uri.joinPath(root, 'res/values/colors.xml')
  const aliasesUri = Uri.joinPath(root, 'res/values/aliases.xml')
  const layoutUri = Uri.joinPath(root, 'res/layout/main.xml')
  const qualifierUri = Uri.joinPath(root, 'res/values-night/colors.xml')
  const colors =
    '<!-- 前置 🎨 -->\n<resources>\n  <color name="brand">#80ff0000</color>\n</resources>'
  const source =
    '<!-- 前置 🎨 -->\n<TextView android:textColor="@color/alias"/>'
  const config = workspace.getConfiguration('color-highlight')
  const previous = config.inspect<boolean>('enableColorNavigation')?.globalValue
  const previousEffective = config.get<boolean>('enableColorNavigation', true)

  async function definitions(document: TextDocument): Promise<LocationLink[]> {
    return (
      (await commands.executeCommand<LocationLink[]>(
        'vscode.executeDefinitionProvider',
        document.uri,
        document.positionAt(source.indexOf('@color/alias') + 8),
      )) ?? []
    )
  }

  try {
    await config.update(
      'enableColorNavigation',
      true,
      ConfigurationTarget.Global,
    )
    await waitForConfigValue('enableColorNavigation', true)
    await write(colorsUri, colors)
    await write(
      aliasesUri,
      '<resources><item type="color" name="alias">@color/brand</item></resources>',
    )
    await write(layoutUri, source)
    assertEqual(
      new TextDecoder().decode(await workspace.fs.readFile(colorsUri)),
      colors,
      'Expected intact resource fixture',
    )
    const document = await workspace.openTextDocument(layoutUri)
    await languages.setTextDocumentLanguage(document, 'xml')
    await window.showTextDocument(document)
    const links = await definitions(document)
    assertEqual(links.length, 1, 'Expected one Android resource definition')
    const [link] = links
    assertEqual(
      link.targetUri.toString(),
      colorsUri.toString(),
      'Expected terminal declaration URI',
    )
    assertCondition(
      link.originSelectionRange,
      'Expected complete reference range',
    )
    assertEqual(
      document.getText(link.originSelectionRange),
      '@color/alias',
      'Expected precise reference',
    )
    const target = await workspace.openTextDocument(colorsUri)
    assertCondition(
      link.targetSelectionRange,
      'Expected a declaration selection range',
    )
    assertEqual(
      target.getText(link.targetSelectionRange),
      'brand',
      'Expected declaration name selection',
    )
    assertEqual(
      target.getText(link.targetRange),
      '<color name="brand">#80ff0000</color>',
      'Expected full declaration range',
    )

    const targetEditor = await window.showTextDocument(target)
    assertCondition(
      await targetEditor.edit(builder =>
        builder.insert(target.positionAt(0), '\n\n'),
      ),
      'Expected unsaved target edit',
    )
    const moved = await definitions(document)
    assertEqual(moved.length, 1, 'Expected link after unsaved edit')
    assertCondition(
      moved[0].targetSelectionRange,
      'Expected an updated declaration selection range',
    )
    assertEqual(
      moved[0].targetSelectionRange.start.line,
      link.targetSelectionRange.start.line + 2,
      'Expected updated target offsets',
    )

    await write(
      qualifierUri,
      '<resources><color name="brand">#000</color></resources>',
    )
    const qualified = await definitions(document)
    assertEqual(
      qualified.length,
      0,
      'Qualified names must not produce a target',
    )
    await workspace.fs.delete(qualifierUri)
    const restored = await definitions(document)
    assertEqual(
      restored.length,
      1,
      'Deleting a qualifier restores unique navigation',
    )

    assertCondition(
      await targetEditor.edit(builder =>
        builder.replace(
          moved[0].targetRange,
          '<color name="brand">@color/alias</color>',
        ),
      ),
      'Expected cyclic alias edit',
    )
    const cyclic = await definitions(document)
    assertEqual(
      cyclic.length,
      0,
      'Unsaved alias cycles must not produce a target',
    )
    const targetLength = target.getText().length
    assertCondition(
      await targetEditor.edit(builder =>
        builder.replace(
          new Range(target.positionAt(0), target.positionAt(targetLength)),
          colors,
        ),
      ),
      'Expected static color restoration',
    )
    await config.update(
      'enableColorNavigation',
      false,
      ConfigurationTarget.Global,
    )
    await waitForConfigValue('enableColorNavigation', false)
    const disabled = await definitions(document)
    assertEqual(disabled.length, 0, 'Navigation setting must be honored')
  } finally {
    await config.update(
      'enableColorNavigation',
      previous,
      ConfigurationTarget.Global,
    )
    await waitForConfigValue('enableColorNavigation', previousEffective)
    for (const document of workspace.textDocuments) {
      if (document.uri.toString().startsWith(`${root.toString()}/`)) {
        await window.showTextDocument(document)
        await commands.executeCommand(
          'workbench.action.revertAndCloseActiveEditor',
        )
      }
    }
    await workspace.fs.delete(root, { recursive: true })
  }
}

/**
 * Create a resource fixture on the desktop or virtual Web filesystem.
 */
async function write(uri: Uri, text: string): Promise<void> {
  const parent = Uri.joinPath(uri, '..')
  try {
    await workspace.fs.stat(parent)
  } catch {
    await workspace.fs.createDirectory(parent)
  }
  await workspace.fs.writeFile(uri, new TextEncoder().encode(text))
}

import {
  env,
  QuickInputButtons,
  Selection,
  ThemeIcon,
  Uri,
  window,
  workspace,
} from 'vscode'
import type { Disposable, QuickInputButton, QuickPickItem } from 'vscode'
import type { ContrastColorSelection } from '../commands/workspace-palette'
import { evaluateColorContrast } from '../contrast/evaluate'
import {
  getColorPresentationsFromRgba,
  parseResolvedColor,
} from '../utils/color/presentation'
import type {
  WorkspaceColorGroup,
  WorkspaceColorOccurrence,
  WorkspacePaletteResult,
} from './types'

const copyButton: QuickInputButton = {
  iconPath: new ThemeIcon('copy'),
  tooltip: 'Copy HEX',
}
const contrastButton: QuickInputButton = {
  iconPath: new ThemeIcon('symbol-color'),
  tooltip: 'Check contrast',
}

interface PaletteItem extends QuickPickItem {
  readonly group: WorkspaceColorGroup
}

interface OccurrenceItem extends QuickPickItem {
  readonly occurrence?: WorkspaceColorOccurrence
  readonly value?: string
}

interface ColorItem extends QuickPickItem {
  readonly selection: ContrastColorSelection
}

type PickOutcome<T> =
  | { readonly kind: 'accept'; readonly item: T }
  | { readonly kind: 'back' }
  | { readonly kind: 'cancel' }
  | {
      readonly kind: 'item-button'
      readonly button: QuickInputButton
      readonly item: T
    }

interface PickOptions<T extends QuickPickItem> {
  readonly buttons?: readonly QuickInputButton[]
  readonly items: readonly T[]
  readonly placeholder?: string
  readonly title: string
  readonly onItemButton?: (
    item: T,
    button: QuickInputButton,
  ) => Promise<boolean> | boolean
}

/** Show the ephemeral workspace palette until the user navigates or cancels. */
export async function showWorkspacePaletteQuickPick(
  palette: WorkspacePaletteResult,
  onContrast: (
    selection: ContrastColorSelection,
    palette: WorkspacePaletteResult,
  ) => Promise<void>,
): Promise<void> {
  while (true) {
    const items = palette.groups.map(toPaletteItem)
    const outcome = await runQuickPick({
      items,
      title: paletteTitle(palette),
      placeholder: 'Select a color to view its occurrences',
      onItemButton: async (item, button) => {
        if (button === copyButton) {
          await env.clipboard.writeText(item.group.presentations.hex)
          return false
        }
        return true
      },
    })

    if (outcome.kind === 'cancel') {
      return
    }
    if (outcome.kind === 'item-button') {
      if (outcome.button === contrastButton) {
        await onContrast({ color: outcome.item.group.color }, palette)
        return
      }
      continue
    }
    if (outcome.kind !== 'accept') {
      continue
    }

    const occurrenceOutcome = await showOccurrenceQuickPick(outcome.item.group)
    if (occurrenceOutcome === 'done' || occurrenceOutcome === 'cancel') {
      return
    }
  }
}

/** Ask which contrast role a palette-button selection should occupy. */
export async function selectContrastRole(): Promise<
  'background' | 'cancel' | 'foreground'
> {
  const outcome = await runQuickPick({
    items: [
      { label: 'Background', description: 'Use this color as the canvas' },
      { label: 'Foreground', description: 'Use this color as the text' },
    ],
    title: 'Use Selected Color As',
  })
  if (outcome.kind !== 'accept') {
    return 'cancel'
  }
  return outcome.item.label === 'Background' ? 'background' : 'foreground'
}

/** Select one color group for a contrast role. */
export async function selectContrastColor(
  palette: WorkspacePaletteResult,
  role: 'Background' | 'Foreground',
  allowBack: boolean,
): Promise<ContrastColorSelection | 'back' | null> {
  const outcome = await runQuickPick({
    buttons: allowBack ? [QuickInputButtons.Back] : undefined,
    items: palette.groups.map<ColorItem>(group => ({
      description: occurrenceDescription(group),
      detail: `${group.presentations.rgb} · ${group.presentations.hsl} · ${group.presentations.oklch}`,
      iconPath: new ThemeIcon('symbol-color'),
      label: group.presentations.hex,
      selection: { color: group.color },
    })),
    placeholder: `Select the ${role.toLocaleLowerCase()} color`,
    title: `${role} Color`,
  })
  if (outcome.kind === 'back') {
    return 'back'
  }
  if (outcome.kind !== 'accept') {
    return null
  }
  return outcome.item.selection
}

export type ContrastResultAction =
  | 'background'
  | 'cancel'
  | 'foreground'
  | 'rerun'

/** Display one WCAG comparison and return the requested next action. */
export async function showContrastResult(
  background: ContrastColorSelection,
  foreground: ContrastColorSelection,
  canChangeSelection: boolean,
): Promise<ContrastResultAction> {
  const backgroundRgba = parseResolvedColor(background.color)
  const foregroundRgba = parseResolvedColor(foreground.color)
  if (!backgroundRgba || !foregroundRgba) {
    await window.showWarningMessage('The selected color could not be compared.')
    return 'cancel'
  }

  const evaluation = evaluateColorContrast(foregroundRgba, backgroundRgba)
  const items: (QuickPickItem & {
    action?: ContrastResultAction
    value?: string
  })[] = []
  let title: string

  if (evaluation.kind === 'determinate') {
    title = `Color Contrast — ${evaluation.ratio.toFixed(2)}:1`
    const effective = getColorPresentationsFromRgba(
      evaluation.effectiveForeground,
    ).rgb
    items.push(
      resultRow('AA normal text', evaluation.aaNormalText),
      resultRow('AA large text', evaluation.aaLargeText),
      resultRow('AAA normal text', evaluation.aaaNormalText),
      resultRow('AAA large text', evaluation.aaaLargeText),
      {
        label: 'Effective foreground',
        description: effective,
        value: effective,
      },
    )
  } else {
    title = 'Color Contrast — Indeterminate'
    items.push({
      label: 'Cannot determine WCAG contrast',
      detail:
        'The selected background is translucent, so its effective canvas color is unknown.',
    })
  }

  if (canChangeSelection) {
    items.push(
      {
        action: 'background',
        label: 'Change background color',
        description: background.color,
      },
      {
        action: 'foreground',
        label: 'Change foreground color',
        description: foreground.color,
      },
    )
  }
  items.push(
    { label: 'Copy background color', value: background.color },
    { label: 'Copy foreground color', value: foreground.color },
  )
  if (canChangeSelection) {
    items.push({ action: 'rerun', label: 'Compare another pair' })
  }

  while (true) {
    const outcome = await runQuickPick({ items, title })
    if (outcome.kind !== 'accept') {
      return 'cancel'
    }
    if (outcome.item.value) {
      await env.clipboard.writeText(outcome.item.value)
      continue
    }
    if (outcome.item.action) {
      return outcome.item.action
    }
  }
}

async function showOccurrenceQuickPick(
  group: WorkspaceColorGroup,
): Promise<'back' | 'cancel' | 'done'> {
  while (true) {
    const outcome = await runQuickPick<OccurrenceItem>({
      buttons: [QuickInputButtons.Back],
      items: [
        { label: 'Copy as HEX', value: group.presentations.hex },
        { label: 'Copy as RGB', value: group.presentations.rgb },
        { label: 'Copy as HSL', value: group.presentations.hsl },
        { label: 'Copy as OKLCH', value: group.presentations.oklch },
        ...group.occurrences.map(occurrence => ({
          description: occurrence.sourceText,
          label: Uri.parse(occurrence.uri).path ?? occurrence.uri,
          occurrence,
        })),
      ],
      title: `${group.presentations.hex} Occurrences`,
    })

    if (outcome.kind === 'back') {
      return 'back'
    }
    if (outcome.kind !== 'accept') {
      return 'cancel'
    }
    if (outcome.item.value) {
      await env.clipboard.writeText(outcome.item.value)
      continue
    }
    if (outcome.item.occurrence) {
      if (await navigateToOccurrence(outcome.item.occurrence)) {
        return 'done'
      }
    }
  }
}

async function navigateToOccurrence(
  occurrence: WorkspaceColorOccurrence,
): Promise<boolean> {
  let document
  try {
    document = await workspace.openTextDocument(Uri.parse(occurrence.uri))
  } catch {
    await window.showWarningMessage(
      'The selected color file is no longer available.',
    )
    return false
  }

  const start = document.positionAt(occurrence.start)
  const end = document.positionAt(occurrence.end)
  const selection = new Selection(start, end)
  if (document.getText(selection) !== occurrence.sourceText) {
    await window.showWarningMessage(
      'The selected color occurrence has changed.',
    )
    return false
  }

  try {
    const editor = await window.showTextDocument(document)
    editor.selection = selection
    editor.revealRange(selection)
    return true
  } catch {
    await window.showWarningMessage(
      'The selected color file could not be opened.',
    )
    return false
  }
}

function toPaletteItem(group: WorkspaceColorGroup): PaletteItem {
  return {
    buttons: [copyButton, contrastButton],
    description: occurrenceDescription(group),
    detail: `${group.presentations.rgb} · ${group.presentations.hsl} · ${group.presentations.oklch}`,
    group,
    iconPath: new ThemeIcon('symbol-color'),
    label: group.presentations.hex,
  }
}

function occurrenceDescription(group: WorkspaceColorGroup): string {
  const occurrences = group.occurrences.length
  const files = new Set(group.occurrences.map(item => item.uri)).size
  return `${occurrences} ${plural(occurrences, 'occurrence')} in ${files} ${plural(files, 'file')}`
}

function paletteTitle(palette: WorkspacePaletteResult): string {
  const parts = [
    `${palette.scannedFileCount} ${plural(palette.scannedFileCount, 'file')}`,
  ]
  if (palette.skippedFileCount > 0) {
    parts.push(`${palette.skippedFileCount} skipped`)
  }
  if (palette.truncated) {
    parts.push('files truncated')
  }
  if (palette.occurrenceTruncated) {
    parts.push('occurrences truncated')
  }
  return `Workspace Palette — ${parts.join(' · ')}`
}

function plural(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`
}

function resultRow(label: string, passed: boolean): QuickPickItem {
  return {
    description: passed ? 'Pass' : 'Fail',
    iconPath: new ThemeIcon(passed ? 'pass' : 'error'),
    label,
  }
}

async function runQuickPick<T extends QuickPickItem>({
  buttons,
  items,
  onItemButton,
  placeholder,
  title,
}: PickOptions<T>): Promise<PickOutcome<T>> {
  const quickPick = window.createQuickPick<T>()
  quickPick.buttons = buttons ? [...buttons] : []
  quickPick.items = [...items]
  quickPick.placeholder = placeholder
  quickPick.title = title

  return new Promise(resolve => {
    const disposables: Disposable[] = []
    let settled = false
    const finish = (outcome: PickOutcome<T>): void => {
      if (settled) {
        return
      }
      settled = true
      for (const disposable of disposables) {
        disposable.dispose()
      }
      quickPick.dispose()
      resolve(outcome)
    }

    disposables.push(
      quickPick.onDidAccept(() => {
        const item = quickPick.selectedItems[0]
        if (item) {
          finish({ kind: 'accept', item })
        }
      }),
      quickPick.onDidHide(() => finish({ kind: 'cancel' })),
      quickPick.onDidTriggerButton(button => {
        if (button === QuickInputButtons.Back) {
          finish({ kind: 'back' })
        }
      }),
      quickPick.onDidTriggerItemButton(async ({ button, item }) => {
        if (onItemButton && !(await onItemButton(item, button))) {
          return
        }
        finish({ button, item, kind: 'item-button' })
      }),
    )
    quickPick.show()
  })
}

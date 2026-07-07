# Hover Color Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add compact hover icons for copying, replacing, and adjusting detected color values.

**Architecture:** Keep detection unchanged. Extend hover markdown payloads with source ranges and original text, add command handlers for replacement and alpha adjustment, and add small pure helpers for alpha-aware color presentations and HEX case preservation.

**Tech Stack:** TypeScript, VS Code command links, reactive-vscode commands, Vitest, `pnpm`, `vscode-ext-gen`.

## Global Constraints

- Use VS Code markdown command links; no webview.
- Render hover actions with non-breaking-space padded inline-code labels and
  values so labels, values, and action links align in VS Code hover without
  markdown table syntax.
- Copy actions render as `$(copy)` icons instead of the word `Copy`.
- Each format row has copy and replace icons.
- Alpha adjustment is limited to `-10%` and `+10%`.
- HEX case is preserved automatically; no separate HEX case buttons.
- Replacement commands do nothing when the stored source range is stale.
- `0xRRGGBB` source text is replaced with CSS `#rrggbb` HEX syntax.
- Shell commands must be prefixed with `rtk`, except `pnpm typecheck`.

---

## File Structure

- Modify `src/utils/color/presentation.ts`
  - Export `RgbaColor`.
  - Export `getColorPresentationsFromRgba`.
  - Export `withAlpha`.
  - Export `formatColorPresentation`.
- Modify `src/hover/color-hover.ts`
  - Add hover command payload types.
  - Include `originalText`, `originalColor`, and `range` in hover data.
  - Render non-breaking-space padded inline-code labels and values with codicon
    copy, replace, alpha decrease, and alpha increase links.
- Modify `src/commands.ts`
  - Add replace and alpha command registration.
  - Validate command payloads.
  - Replace active-editor ranges only when `originalText` still matches.
  - Preserve HEX case for HEX replacements.
- Modify `package.json`
  - Add replace and alpha commands to `contributes.commands`.
- Regenerate `src/meta.ts`
  - Produced by `rtk pnpm generate:meta`; do not edit manually.
- Modify `tests/color-hover.test.ts`
  - Assert icon markdown and command payloads.
- Modify `tests/commands.test.ts`
  - Assert copy still works, replacement edits ranges, stale ranges do nothing,
    alpha clamps, source format selection, and HEX case preservation.
- Modify `README.md`
  - Document hover copy/replace icons and alpha controls.

## Task 1: Color Presentation Helpers

**Files:**

- Modify: `src/utils/color/presentation.ts`
- Test: `tests/commands.test.ts`

**Interfaces:**

- Produces:
  - `export interface RgbaColor { readonly r: number; readonly g: number; readonly b: number; readonly a: number }`
  - `export function getColorPresentationsFromRgba(color: RgbaColor): ColorPresentations`
  - `export function withAlpha(color: RgbaColor, alpha: number): RgbaColor`
  - `export function formatColorPresentation(presentations: ColorPresentations, format: CopyColorFormat): string`

- [ ] **Step 1: Write failing tests for alpha formatting**

Add tests in `tests/commands.test.ts` after the existing copy tests:

```ts
it('adjusts alpha down and replaces hex with a transparent hex value', async () => {
  vi.resetModules()
  registeredCommands.clear()
  edit.mockClear()
  getText.mockReturnValue('.box { color: #ff0000; }')

  const { useCommands } = await import('../src/commands')

  useCommands()
  await registeredCommands.get('color-highlight.adjustColorAlpha')?.({
    delta: -0.1,
    originalColor: 'rgb(255, 0, 0)',
    originalText: '#ff0000',
    range: { start: 14, end: 21 },
  })

  expect(replace).toHaveBeenCalledWith(expect.any(Object), '#ff0000e6')
})

it('clamps alpha up to opaque rgb syntax', async () => {
  vi.resetModules()
  registeredCommands.clear()
  edit.mockClear()
  getText.mockReturnValue('.box { color: rgba(255, 0, 0, 0.95); }')

  const { useCommands } = await import('../src/commands')

  useCommands()
  await registeredCommands.get('color-highlight.adjustColorAlpha')?.({
    delta: 0.1,
    originalColor: 'rgba(255, 0, 0, 0.95)',
    originalText: 'rgba(255, 0, 0, 0.95)',
    range: { start: 14, end: 36 },
  })

  expect(replace).toHaveBeenCalledWith(expect.any(Object), 'rgb(255, 0, 0)')
})
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
rtk pnpm test tests/commands.test.ts
```

Expected: FAIL because `adjustColorAlpha` is not registered.

- [ ] **Step 3: Add presentation helpers**

In `src/utils/color/presentation.ts`, export `RgbaColor`, move the existing
presentation body into `getColorPresentationsFromRgba`, and add:

```ts
export function getColorPresentations(
  color: string,
): ColorPresentations | null {
  const rgba = parseResolvedColor(color)
  return rgba ? getColorPresentationsFromRgba(rgba) : null
}

export function getColorPresentationsFromRgba(
  color: RgbaColor,
): ColorPresentations {
  return {
    alpha: formatAlpha(color.a),
    hex: formatHex(color),
    hsl: formatHsl(color),
    oklch: formatOklch(color),
    rgb: formatRgb(color),
  }
}

export function withAlpha(color: RgbaColor, alpha: number): RgbaColor {
  return {
    ...color,
    a: clamp(alpha, 0, 1),
  }
}
```

- [ ] **Step 4: Continue after command implementation**

This task's tests pass after Task 3 registers and implements the alpha command.

## Task 2: Hover Markdown Payloads

**Files:**

- Modify: `src/hover/color-hover.ts`
- Test: `tests/color-hover.test.ts`

**Interfaces:**

- Produces:
  - `ColorHover.originalText: string`
  - `ColorHover.originalColor: string`
  - `buildColorHoverMarkdown(hover: ColorHover): string`

- [ ] **Step 1: Write failing hover markdown tests**

Replace the current `buildColorHoverMarkdown` test with:

```ts
it('renders color formats with copy and replace icon command links', () => {
  const result = buildColorHoverMarkdown({
    originalColor: 'rgba(255, 0, 0, 0.5)',
    originalText: '#ff000080',
    range: { end: 21, start: 12 },
    presentations: {
      alpha: '50%',
      hex: '#ff000080',
      hsl: 'hsl(0 100% 50% / 0.5)',
      oklch: 'oklch(62.8% 0.258 29.2 / 0.5)',
      rgb: 'rgba(255, 0, 0, 0.5)',
    },
  })

  expect(result).not.toContain('| Format | Value | Actions |')
  expect(result).toContain('`HEX  ` `#ff000080`')
  expect(result).toContain('[$(copy)]')
  expect(result).toContain('[$(replace)]')
  expect(result).toContain('command:color-highlight.copyColorAsHex')
  expect(result).toContain('command:color-highlight.replaceColorAsHex')
  expect(result).toContain('command:color-highlight.adjustColorAlpha')
  expect(decodeURIComponent(result)).toContain('"originalText":"#ff000080"')
  expect(decodeURIComponent(result)).toContain('"delta":-0.1')
  expect(decodeURIComponent(result)).toContain('"delta":0.1')
})
```

Update `getColorHover` expected data to include:

```ts
originalColor: 'rgb(255, 0, 0)',
originalText: '#ff0000',
```

- [ ] **Step 2: Run hover tests to verify failure**

Run:

```bash
rtk pnpm test tests/color-hover.test.ts
```

Expected: FAIL because `buildColorHoverMarkdown` still accepts presentations.

- [ ] **Step 3: Extend hover data and markdown**

In `src/hover/color-hover.ts`, add `originalText` and `originalColor` to
`ColorHover`, return them from `getColorHover`, and change
`buildColorHoverMarkdown` to accept `ColorHover`.

Use this payload builder:

```ts
function buildCommandLink(command: string, payload: unknown): string {
  const args = encodeURIComponent(JSON.stringify([payload]))
  return `command:${command}?${args}`
}
```

Format rows as:

```ts
return `${label}: \`${value}\` [$(copy)](${copyLink}) [$(replace)](${replaceLink})`
```

Build alpha links with payloads containing `delta`, `originalColor`,
`originalText`, and `range`.

- [ ] **Step 4: Update hover provider call site**

In `src/composables/use-color-hover.ts`, call:

```ts
buildColorHoverMarkdown(hover)
```

- [ ] **Step 5: Run hover tests**

Run:

```bash
rtk pnpm test tests/color-hover.test.ts
```

Expected: PASS.

## Task 3: Replacement And Alpha Commands

**Files:**

- Modify: `src/commands.ts`
- Test: `tests/commands.test.ts`

**Interfaces:**

- Consumes:
  - `parseResolvedColor`, `getColorPresentationsFromRgba`, `withAlpha`
  - Hover payloads with `range`, `originalText`, `originalColor`, and `value`
- Produces:
  - `color-highlight.replaceColorAsHex/Rgb/Hsl/Oklch`
  - `color-highlight.adjustColorAlpha`

- [ ] **Step 1: Write failing replacement tests**

Add tests in `tests/commands.test.ts`:

```ts
it('replaces the active editor color range when original text matches', async () => {
  vi.resetModules()
  registeredCommands.clear()
  edit.mockClear()
  getText.mockReturnValue('.box { color: #ff0000; }')

  const { useCommands } = await import('../src/commands')

  useCommands()
  await registeredCommands.get('color-highlight.replaceColorAsRgb')?.({
    originalText: '#ff0000',
    range: { start: 14, end: 21 },
    value: 'rgb(255, 0, 0)',
  })

  expect(replace).toHaveBeenCalledWith(expect.any(Object), 'rgb(255, 0, 0)')
})

it('does not replace a stale active editor range', async () => {
  vi.resetModules()
  registeredCommands.clear()
  edit.mockClear()
  getText.mockReturnValue('.box { color: #00ff00; }')

  const { useCommands } = await import('../src/commands')

  useCommands()
  await registeredCommands.get('color-highlight.replaceColorAsRgb')?.({
    originalText: '#ff0000',
    range: { start: 14, end: 21 },
    value: 'rgb(255, 0, 0)',
  })

  expect(replace).not.toHaveBeenCalled()
})

it('preserves uppercase hex style when replacing as hex', async () => {
  vi.resetModules()
  registeredCommands.clear()
  edit.mockClear()
  getText.mockReturnValue('.box { color: #FF0000; }')

  const { useCommands } = await import('../src/commands')

  useCommands()
  await registeredCommands.get('color-highlight.replaceColorAsHex')?.({
    originalText: '#FF0000',
    range: { start: 14, end: 21 },
    value: '#ff0000',
  })

  expect(replace).toHaveBeenCalledWith(expect.any(Object), '#FF0000')
})
```

- [ ] **Step 2: Run command tests to verify failure**

Run:

```bash
rtk pnpm test tests/commands.test.ts
```

Expected: FAIL because replacement commands are not registered.

- [ ] **Step 3: Implement command registration and helpers**

In `src/commands.ts`:

- Register the new commands with `useCommand`.
- Add `replaceColorValue(value, originalText, range)`.
- Add `normalizeHexCase(value, originalText)`.
- Add `adjustColorAlpha(payload)`.
- Use `document.positionAt` and `document.getText(range)` for range checks.

Source format selection:

```ts
function getFormatForSourceText(text: string): CopyColorFormat {
  const normalized = text.trim().toLowerCase()
  if (normalized.startsWith('#') || normalized.startsWith('0x')) return 'hex'
  if (normalized.startsWith('hsl')) return 'hsl'
  if (normalized.startsWith('oklch')) return 'oklch'
  return 'rgb'
}
```

- [ ] **Step 4: Run command tests**

Run:

```bash
rtk pnpm test tests/commands.test.ts
```

Expected: PASS.

## Task 4: Metadata And README

**Files:**

- Modify: `package.json`
- Generated: `src/meta.ts`
- Modify: `README.md`
- Test: `tests/readme.test.ts`

**Interfaces:**

- Produces generated command ids in `commands`.

- [ ] **Step 1: Add contributed commands**

Add these command contributions after the copy commands in `package.json`:

```json
{
  "category": "Color Highlight",
  "command": "color-highlight.replaceColorAsHex",
  "title": "Replace Color as HEX"
}
```

Repeat for RGB, HSL, OKLCH, and add:

```json
{
  "category": "Color Highlight",
  "command": "color-highlight.adjustColorAlpha",
  "title": "Adjust Color Alpha"
}
```

- [ ] **Step 2: Regenerate metadata**

Run:

```bash
rtk pnpm generate:meta
```

Expected: `src/meta.ts` includes the new command keys.

- [ ] **Step 3: Update README**

In the `Configs` section description for `color-highlight.enableHover`, keep
the generated text. Add a paragraph after the JSON design token section:

```md
When `color-highlight.enableHover` is enabled, each hover row shows compact
copy and replace icons for HEX, RGB, HSL, and OKLCH values. The alpha row can
decrease or increase transparency in 10 percentage point steps.
```

- [ ] **Step 4: Run README tests**

Run:

```bash
rtk pnpm test tests/readme.test.ts
```

Expected: PASS.

## Task 5: Final Verification

**Files:**

- Verify all touched files.

- [ ] **Step 1: Run focused tests**

Run:

```bash
rtk pnpm test tests/color-hover.test.ts tests/commands.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run repository checks**

Run:

```bash
rtk pnpm run format:check
rtk pnpm run lint
pnpm typecheck
rtk pnpm run test:unit
```

Expected: all commands PASS.

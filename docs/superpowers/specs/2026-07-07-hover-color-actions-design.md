# Hover Color Actions

Date: 2026-07-07

## Goal

Enhance the optional color hover so users can copy, replace, and lightly adjust
detected colors without leaving the editor.

The first version focuses on compact hover actions:

- Replace the current color text with any displayed format.
- Keep copy actions, but render them as small icons instead of the word
  "Copy".
- Add quick alpha controls for `-10%` and `+10%`.
- Preserve HEX upper/lowercase style automatically when replacing with HEX.

## User Experience

When `color-highlight.enableHover` is enabled, the hover continues to use VS
Code markdown command links. It does not introduce a webview.

Each color format appears on its own line. The format label and value code span
are padded with non-breaking spaces to align labels, values, and action links
without relying on markdown table syntax:

```md
**Color Highlight**

`HEX  ` `#ff0000` [$(copy)](...) [$(replace)](...)
`RGB  ` `rgb(255, 0, 0)` [$(copy)](...) [$(replace)](...)
`HSL  ` `hsl(0 100% 50%)` [$(copy)](...) [$(replace)](...)
`OKLCH` `oklch(62.8% 0.258 29.2)` [$(copy)](...) [$(replace)](...)
`Alpha` `100%` [$(remove)](...) [$(add)](...)
```

Actions:

- `$(copy)` copies that row's formatted value.
- `$(replace)` replaces the detected source range with that row's formatted
  value.
- `$(remove)` lowers alpha by 10 percentage points.
- `$(add)` raises alpha by 10 percentage points.

The alpha line should use icon command links only. It should not add an input
box or extra alpha presets in this version.

## Commands

Keep the existing copy commands:

- `color-highlight.copyColorAsHex`
- `color-highlight.copyColorAsRgb`
- `color-highlight.copyColorAsHsl`
- `color-highlight.copyColorAsOklch`

Add replacement commands:

- `color-highlight.replaceColorAsHex`
- `color-highlight.replaceColorAsRgb`
- `color-highlight.replaceColorAsHsl`
- `color-highlight.replaceColorAsOklch`

Add one alpha adjustment command:

- `color-highlight.adjustColorAlpha`

Register the new commands with `useCommand` and add them to `package.json`
`contributes.commands` with concise titles. They are primarily used by hover
command links, but exposing them keeps the extension metadata complete.

## Command Payload

Hover command links should pass a single structured payload. For replacement
commands:

```ts
interface ReplaceColorPayload {
  readonly originalText: string
  readonly range: {
    readonly start: number
    readonly end: number
  }
  readonly value: string
}
```

For alpha adjustment:

```ts
interface AdjustColorAlphaPayload {
  readonly delta: -0.1 | 0.1
  readonly originalColor: string
  readonly originalText: string
  readonly range: {
    readonly start: number
    readonly end: number
  }
}
```

`range` uses document offsets. `originalText` is the exact text that was
detected when the hover was built.

## Replacement Behavior

Replacement commands should:

1. Resolve the active text editor.
2. Convert payload offsets to a VS Code range.
3. Check that the current text inside the range still equals `originalText`.
4. Replace that range with the requested value.
5. Return without a noisy error when there is no active editor, the payload is
   invalid, the offsets are invalid, or the range no longer contains the
   original text.

The range check is intentionally conservative. It avoids replacing unrelated
text after the document changes between hover creation and command execution.

Fallback cursor re-detection is not required for the first version. If the
stored range is stale, the command should do nothing.

## Alpha Adjustment

Alpha adjustment starts from the resolved color string attached to the hover
match, not from reparsing the raw source text. The command computes:

```ts
nextAlpha = clamp(currentAlpha + delta, 0, 1)
```

Then it formats a replacement value using the source text's apparent format:

- Current source starts with `#` or `0x`: output HEX.
- Current source starts with `rgb` or `rgba`: output RGB/RGBA.
- Current source starts with `hsl` or `hsla`: output HSL.
- Current source starts with `oklch`: output OKLCH.
- Other formats, including named colors, `hwb()`, `lab()`, `lch()`,
  `oklab()`, and `color()`: output RGB/RGBA.

When alpha becomes `1`, transparent syntax should collapse to opaque syntax:

- HEX omits the alpha byte.
- RGB uses `rgb(...)`.
- HSL and OKLCH omit slash alpha.

When alpha is less than `1`, use the existing presentation formatting:

- HEX includes an alpha byte.
- RGB uses `rgba(...)`.
- HSL and OKLCH include slash alpha.

## HEX Case Preservation

When replacing with HEX, automatically preserve the source text's case style:

- If the original text is a HEX-like value and it contains at least one `A-F`
  letter and no `a-f` letters, output uppercase HEX.
- Otherwise output lowercase HEX.

This applies to direct HEX replacement and alpha-adjusted HEX output.

`0xRRGGBB` input is not preserved as `0x` in this version. Replacements use CSS
HEX syntax with a `#` prefix because the hover format is explicitly `HEX`.

## Architecture

Keep the feature inside the existing hover and command boundaries:

- `src/hover/color-hover.ts`
  - Continue to resolve color matches.
  - Build compact markdown rows with codicon command links.
  - Include `range`, `originalText`, and the row value in command payloads.
- `src/commands.ts`
  - Keep copy command registration.
  - Add replace and alpha adjustment command registration.
  - Keep command handlers small by delegating range validation, replacement,
    alpha adjustment, and HEX case handling to local helpers or focused utility
    functions.
- `src/utils/color/presentation.ts`
  - Reuse existing color presentation generation.
  - Add a pure helper only if alpha adjustment needs to build presentations from
    RGBA channel values.

No detector strategy changes are required. The hover already receives the match
range and resolved color through the existing detection pipeline.

## Error Handling

Command handlers should be quiet and safe:

- Invalid payloads do nothing.
- Missing active editor does nothing.
- Invalid ranges do nothing.
- Stale ranges do nothing.
- Failed editor edits do not show intrusive errors.

Copy commands should keep the current success message after writing to the
clipboard.

## Testing

Add or update Vitest coverage for:

- Hover markdown renders codicon command links for copy and replace.
- Each format row includes the correct copy command payload.
- Each format row includes the correct replace command payload.
- The alpha row includes `-0.1` and `0.1` adjustment payloads.
- Copy commands still write the expected value to the clipboard.
- Replace commands edit the active editor range when the original text matches.
- Replace commands do nothing when the current range text differs from
  `originalText`.
- Alpha adjustment clamps at `0` and `1`.
- Alpha adjustment chooses HEX, RGB/RGBA, HSL, OKLCH, or RGB/RGBA fallback based
  on the original source text.
- HEX replacement preserves uppercase style when the original HEX text is
  uppercase, and defaults to lowercase otherwise.

Run the focused tests while implementing:

```bash
rtk pnpm test tests/color-hover.test.ts
rtk pnpm test tests/commands.test.ts
```

Before finishing implementation, run the local gate:

```bash
rtk pnpm run format:check
rtk pnpm run lint
pnpm typecheck
rtk pnpm run test:unit
```

## README Updates

Update the hover-related documentation to mention:

- Hover actions use compact copy and replace icons.
- `color-highlight.enableHover` allows replacing the current color with any
  displayed format.
- Alpha can be adjusted in 10 percentage point steps from the hover.

## Non-Goals

- No webview hover UI.
- No arbitrary alpha input.
- No extra HEX uppercase/lowercase buttons.
- No color picker.
- No palette view.
- No lossless preservation of every original color function syntax when alpha
  changes.

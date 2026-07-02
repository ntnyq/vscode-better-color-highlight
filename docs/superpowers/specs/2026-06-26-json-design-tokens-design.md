# JSON Design Tokens Color Detection

Date: 2026-06-26

## Goal

Add first-class JSON and JSONC design token color detection so colors stored in
token files can be highlighted without making ordinary JSON files noisy.

The first version focuses on JSON-based token files. YAML and Tailwind theme
support remain follow-up work.

## User Experience

JSON and JSONC documents get a new color detection strategy. By default, the
strategy highlights color strings assigned to `value` or `$value` token fields:

```json
{
  "color": {
    "brand": {
      "value": "#0ea5e9"
    },
    "accent": {
      "$value": "oklch(0.7 0.2 200)"
    }
  }
}
```

Users who want broader matching can opt into highlighting every JSON string
whose complete value is a supported color:

```json
{
  "brand": "#0ea5e9",
  "shadow": "rgba(15, 23, 42, 0.2)"
}
```

The highlighted range should be the string contents only, excluding the quote
characters. This matches the visual expectation that the color value is the
thing being decorated.

## Configuration

Add one setting:

- `color-highlight.designTokenJsonMode`
  - Type: `string`
  - Default: `"token-values"`
  - Enum:
    - `"token-values"`: highlight only `value` and `$value` string values.
    - `"strings"`: highlight any JSON string whose full contents are a color.
    - `"all"`: highlight token values and broad strings.
    - `"off"`: disable the JSON design token strategy.

The default stays conservative because the extension can already run in every
language through `color-highlight.languages`. JSON configuration files often
contain strings that are not design tokens, so broad matching should be an
explicit choice.

## Architecture

Create a new strategy module:

- `src/strategies/json-design-tokens.ts`

The strategy exports `findJsonDesignTokens(text, context)`. It follows the same
pure detector shape as the existing strategies and returns `ColorMatch[]`.

Register the strategy only for `json` and `jsonc` documents when
`designTokenJsonMode` is not `"off"`.

JSON and JSONC need special handling in the strategy registry. Today the
generic hex, color-function, and `hwb()` strategies run for every language, so
direct color strings in JSON are already highlighted. To make
`designTokenJsonMode` meaningful, `json` and `jsonc` should use the JSON-aware
strategy as the owner for direct string color detection. In these languages,
skip the generic always-on direct color strategies and let
`findJsonDesignTokens` decide which string values are eligible. Other
language-specific strategies should continue to behave normally.

This is a deliberate behavior refinement: JSON highlighting becomes quieter by
default and broad string matching remains available through
`designTokenJsonMode: "strings"` or `"all"`.

The strategy should not depend on VS Code APIs. Configuration enters through
`StrategyContext`, matching the existing strategy pattern.

## Parsing Model

Use a small JSON/JSONC string scanner rather than introducing a parser
dependency.

The scanner should emit string tokens with:

- `start`: opening quote offset
- `end`: closing quote offset plus one
- `contentStart`: first character inside the quotes
- `contentEnd`: last character inside the quotes plus one
- `value`: unescaped string contents
- `isPropertyKey`: whether the string is followed by a colon after whitespace

The detector then tracks simple object-member context:

- A string marked `isPropertyKey` becomes the pending property key.
- The next string value after a pending key can be evaluated as that property
  value.
- If the pending key is `value` or `$value`, token-value mode may highlight it.
- Broad string mode may highlight any string value, but never property keys.
- Pending keys are cleared when another structural token proves the value is
  not a string. This avoids carrying a key across nested objects, arrays, or
  malformed fragments.

For JSONC, scanner support should skip line comments and block comments so a
commented color does not produce a JSON-token match. Existing generic color
strategies may still see comments in languages where they are active; this
strategy should keep its own behavior precise.

The first version does not need full JSON validation. Malformed input should be
handled best-effort and never throw.

## Color Resolution

The strategy should reuse existing color parsing behavior instead of duplicating
format conversion. A small internal helper can run supported single-value
detectors against the unescaped string and accept only exact full-string
matches.

Supported values should include the formats already advertised by the extension:

- Hex colors
- CSS color functions, including CSS Color 4 forms
- `hwb()`
- Named colors

The exact-match rule prevents partial strings such as `"brand #0ea5e9"` from
being highlighted in JSON token mode.

## Error Handling

The strategy is best-effort:

- Invalid JSON does not throw.
- Invalid escapes should keep scanning where practical.
- Unsupported color strings return no match.
- Duplicate matches from `"all"` mode are de-duplicated by range.

Debug logging is not required for this first version because the strategy does
not perform I/O or expensive resolution.

## Testing

Add focused Vitest coverage:

- `value` highlights a hex color in default mode.
- `$value` highlights a CSS Color 4 function in default mode.
- Default mode does not highlight a non-token property such as `"brand"`.
- `"strings"` mode highlights non-token string values.
- `"all"` mode does not duplicate token-value matches.
- `"off"` mode produces no JSON design token matches.
- Property keys are never highlighted, even if the key text is a color.
- JSONC line and block comments are ignored by this strategy.
- Escaped string contents resolve correctly when the resulting value is a color.
- Malformed input does not throw.
- The strategy registry includes the detector for `json` and `jsonc`, but not
  unrelated languages.
- The strategy registry does not include generic direct color strategies for
  `json` and `jsonc`, so `designTokenJsonMode` is the single control point for
  direct JSON string colors.

Update playground snapshot coverage with a JSON or JSONC token fixture once the
strategy is wired into the registry.

Run:

```bash
rtk pnpm test tests/json-design-tokens.test.ts
rtk pnpm test tests/strategy-registry.test.ts
rtk pnpm test tests/playground-snapshot.test.ts
pnpm typecheck
```

Before finishing implementation, run the full local gate:

```bash
rtk pnpm run format:check
rtk pnpm run lint
pnpm typecheck
rtk pnpm run test:unit
```

## README Updates

Update the supported color formats list to split design-token progress:

- Mark JSON/JSONC design tokens as supported.
- Leave Tailwind and YAML tokens as follow-up work.

Add a short configuration example for `designTokenJsonMode`.

## Non-Goals

- YAML token parsing.
- Tailwind config parsing.
- Design token alias resolution such as `{color.brand}`.
- Type/category inheritance from token groups.
- Full JSON Schema or Design Tokens Community Group validation.
- File-system based token source resolution.

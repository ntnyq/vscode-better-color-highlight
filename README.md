# vscode-better-color-highlight

[![GitHub release](https://img.shields.io/github/v/release/ntnyq/vscode-better-color-highlight?include_prereleases&label=Visual%20Studio%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=ntnyq.vscode-better-color-highlight)
[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/ntnyq/vscode-better-color-highlight/ci.yml?branch=main)](https://github.com/ntnyq/vscode-better-color-highlight/actions/workflows/ci.yml)
[![GitHub top language](https://img.shields.io/github/languages/top/ntnyq/vscode-better-color-highlight)](https://github.com/ntnyq/vscode-better-color-highlight)
[![GitHub](https://img.shields.io/github/license/ntnyq/vscode-better-color-highlight)](https://github.com/ntnyq/vscode-better-color-highlight/blob/main/LICENSE)

Highlight and preview colors in multiple formats across code, comments, and strings.

## Commands

<!-- commands -->

| Command                                | Title                                           |
| -------------------------------------- | ----------------------------------------------- |
| `color-highlight.enable`               | Color Highlight: Enable Better Color Highlight  |
| `color-highlight.disable`              | Color Highlight: Disable Better Color Highlight |
| `color-highlight.copyColorAsHex`       | Color Highlight: Copy Color as HEX              |
| `color-highlight.copyColorAsRgb`       | Color Highlight: Copy Color as RGB              |
| `color-highlight.copyColorAsHsl`       | Color Highlight: Copy Color as HSL              |
| `color-highlight.copyColorAsOklch`     | Color Highlight: Copy Color as OKLCH            |
| `color-highlight.replaceColorAsHex`    | Color Highlight: Replace Color as HEX           |
| `color-highlight.replaceColorAsRgb`    | Color Highlight: Replace Color as RGB           |
| `color-highlight.replaceColorAsHsl`    | Color Highlight: Replace Color as HSL           |
| `color-highlight.replaceColorAsOklch`  | Color Highlight: Replace Color as OKLCH         |
| `color-highlight.adjustColorAlpha`     | Color Highlight: Adjust Color Alpha             |
| `color-highlight.showWorkspacePalette` | Color Highlight: Show Workspace Palette         |
| `color-highlight.checkColorContrast`   | Color Highlight: Check Color Contrast           |

<!-- commands -->

## Configs

<!-- configs-list -->

#### `color-highlight.enable`

Description: Enable or disable color highlighting.  
Type: `boolean`  
Default: `true`

#### `color-highlight.languages`

Description: Language IDs where colors are highlighted. Use '\*' for all languages, prefix with '!' to exclude.  
Type: `array`  
Default: `["*"]`

#### `color-highlight.matchWords`

Description: Highlight named CSS colors (e.g., 'red', 'blue') in non-style languages.  
Type: `boolean`  
Default: `false`

#### `color-highlight.namedColorMatchMode`

Description: Controls named CSS color matching. 'context' matches style-language declaration values, 'always' matches standalone values and non-style language words, and 'never' disables named color matching.  
Type: `string`  
Default: `"context"`

#### `color-highlight.enableHover`

Description: Show hover details and copy actions for highlighted colors.  
Type: `boolean`  
Default: `false`

#### `color-highlight.enableColorPicker`

Description: Use VS Code's native color picker and replacement presentations for detected colors.  
Type: `boolean`  
Default: `false`

#### `color-highlight.enableContrastDiagnostics`

Description: Report low contrast only for deterministic foreground/background pairs in open documents.  
Type: `boolean`  
Default: `false`

#### `color-highlight.enableColorNavigation`

Description: Enable Go to Definition and Peek Definition for supported color variables and design-token aliases.  
Type: `boolean`  
Default: `true`

#### `color-highlight.tailwindColorMode`

Description: Select the Tailwind color palette: auto detects CSS-first v4 signals, while v3 and v4 force that palette version.  
Type: `string`  
Default: `"auto"`

#### `color-highlight.tailwindStylesheetPaths`

Description: File, directory, or glob paths used as Tailwind CSS theme sources in trusted workspaces.  
Type: `array`  
Default: `[]`

#### `color-highlight.resolveScssVariablesAcrossFiles`

Description: Resolve SCSS variables through local @use, @forward, and @import dependencies. Disabled by default to avoid extra file-system work.  
Type: `boolean`  
Default: `false`

#### `color-highlight.scssLoadPaths`

Description: Additional Sass load paths for resolving non-relative SCSS @use, @forward, and @import modules.  
Type: `array`  
Default: `[]`

#### `color-highlight.resolveCssVariablesAcrossFiles`

Description: Resolve CSS custom properties from configured CSS variable source paths. Disabled by default to avoid extra file-system work and ambiguous cascade guesses.  
Type: `boolean`  
Default: `false`

#### `color-highlight.cssVariablePaths`

Description: File, directory, or glob paths used as external CSS custom property sources when CSS variable resolution is enabled.  
Type: `array`  
Default: `[]`

#### `color-highlight.cssVariableTrustedSelectors`

Description: Selectors whose custom property declarations are trusted for cross-file CSS variable color resolution.  
Type: `array`  
Default: `[":root","html","body",":host"]`

#### `color-highlight.maxFileSize`

Description: Maximum document text length, in characters, to scan for color highlighting. Set to 0 to disable this size limit.  
Type: `number`  
Default: `1000000`

#### `color-highlight.workspacePaletteInclude`

Description: Glob pattern that includes files in explicit workspace palette scans.  
Type: `string`  
Default: `"**/*"`

#### `color-highlight.workspacePaletteExclude`

Description: Glob pattern that excludes files from explicit workspace palette scans.  
Type: `string`  
Default: `"{**/.git/**,**/node_modules/**,**/dist/**,**/build/**,**/coverage/**}"`

#### `color-highlight.designTokenJsonMode`

Description: Controls design token color matching. For JSON, JSONC, and .tokens files, 'token-values' matches value and $value fields, 'strings' matches any color string value, and 'all' enables both modes. 'off' disables JSON, JSONC, .tokens, and YAML token matching.  
Type: `string`  
Default: `"token-values"`

#### `color-highlight.resolveDesignTokensAcrossFiles`

Description: Resolve relative JSON, JSONC, JSON-formatted .tokens, and YAML design-token $ref references across files in trusted workspaces.  
Type: `boolean`  
Default: `false`

#### `color-highlight.useARGB`

Description: Interpret 8-digit hex colors as ARGB instead of RGBA.  
Type: `boolean`  
Default: `false`

#### `color-highlight.matchRgbWithNoFunction`

Description: Highlight RGB values not wrapped in rgb() function.  
Type: `boolean`  
Default: `false`

#### `color-highlight.rgbWithNoFunctionLanguages`

Description: Language IDs for rgb-without-function matching. Use '\*' / '!' syntax.  
Type: `array`  
Default: `["*"]`

#### `color-highlight.matchHslWithNoFunction`

Description: Highlight HSL values not wrapped in hsl() function.  
Type: `boolean`  
Default: `false`

#### `color-highlight.hslWithNoFunctionLanguages`

Description: Language IDs for hsl-without-function matching. Use '\*' / '!' syntax.  
Type: `array`  
Default: `["*"]`

#### `color-highlight.markerType`

Description: Style of the color highlight marker.  
Type: `string`  
Default: `"background"`

#### `color-highlight.markRuler`

Description: Show color indicators on the scrollbar ruler.  
Type: `boolean`  
Default: `true`

#### `color-highlight.debug`

Description: Enable debug logging for color detection and decoration.  
Type: `boolean`  
Default: `false`

<!-- configs-list -->

## Workspace palette and color contrast

Run `color-highlight.showWorkspacePalette` to scan the workspace on demand and
group every detected color by its canonical value. The scan uses
`color-highlight.workspacePaletteInclude`, whose default is `"**/*"`, and
`color-highlight.workspacePaletteExclude`, whose default is
`"{**/.git/**,**/node_modules/**,**/dist/**,**/build/**,**/coverage/**}"`.
Empty or invalid glob patterns show an error without returning partial results.

Each palette invocation is cancellable and has non-configurable safety bounds:
at most 256 workspace files, 512 KiB of UTF-8 text per file, and 512 unique dependency-file reads
shared by the entire scan, plus 2,000 retained occurrences per
file, 20,000 retained occurrences per scan, and 1,024 distinct color groups. The extension also
honors `color-highlight.maxFileSize`. Open, unsaved content overrides a matched
file's disk content, but new or untitled documents outside the bounded query are
not added. Binary, unreadable, over-limit, and unsupported files are skipped in
isolation. Results are ordered deterministically by URI; when more than 256
files match, progress and the final palette disclose file truncation. The final
palette separately discloses occurrence truncation whenever any occurrence is
omitted by a per-file, global, or distinct-group retention cap.
Cancelling the scan opens no stale palette.

The top-level Quick Pick can copy a color as HEX or begin a contrast check.
Opening a color lists its occurrences and actions to copy it as HEX, RGB, HSL,
or OKLCH. Choosing an occurrence opens the document and selects the exact source
text; deleted or stale occurrences produce a warning instead of selecting a
different range. Palette data belongs to that Quick Pick session, so the
extension does not retain a workspace index after the interaction ends.

Run `color-highlight.checkColorContrast` to select a background and foreground
from one bounded palette scan. It reports WCAG 2.2 contrast using 4.5:1 for AA
normal text, 3:1 for AA large text, 7:1 for AAA normal text, and 4.5:1 for AAA
large text. Displayed ratios are rounded to two decimals, while pass/fail uses
the unrounded value. A translucent foreground is composited over the selected
opaque background in sRGB. A translucent background is indeterminate because
its canvas color is unknown.

### Contrast diagnostics

`color-highlight.enableContrastDiagnostics` reports deterministic low-contrast
pairs in open documents; the default is `false`. Diagnostics are warnings only
below the WCAG AA normal-text threshold of 4.5:1. They support the final `color`
and `background-color` declarations in one CSS rule, the final pair in one
inline `style` attribute, and resolved `text-*`/`bg-*` utilities with the same
complete Tailwind variant chain in one static `class` or `className` attribute.
The foreground range is the diagnostic location and the background range is
related information.

Extension-owned diagnostics offer these Quick Fixes: `Check these colors`,
`Go to foreground color`, `Go to background color`, and
`Disable contrast diagnostics`. Actions revalidate the document and exact
source ranges before they run, so stale actions only show a warning.

Diagnostics intentionally do not infer cascade or inheritance across selectors,
dynamic class expressions, rendered font size, runtime state, gradients,
images, blend modes, filters, ancestor opacity, ambiguous expressions, or an
unknown canvas. Translucent foreground colors are supported; pairs with a
translucent background are skipped. The extension uses WCAG 2.2 relative
luminance and does not calculate APCA.

Palette scans and diagnostics do not execute project code. Direct colors remain
available in untrusted workspaces, while trusted cross-file dependency reads
keep their existing opt-in settings, trust gates, loader limits, and the shared
palette budget. Runtime access uses VS Code Workspace FS and document APIs, so
the commands and diagnostics work in desktop VS Code, vscode.dev, github.dev,
and virtual workspaces when their files are readable by VS Code.

## Supported color formats

<!-- cSpell: disable-next-line -->

- [x] Hex：`#RGB` `#RRGGBB` `#RGBA` `#RRGGBBAA` `0xRRGGBB` `0xRRGGBBAA`
- [x] `rgb()` / `rgba()`（whitespace, comma and slash alpha）
- [x] `hsl()` / `hsla()`（percentage, angle and slash alpha）
- [x] `hwb()`
- [x] `lab()` / `lch()`
- [x] `oklab()` / `oklch()`
- [x] `color()`：`srgb` `srgb-linear` `display-p3` `a98-rgb` `prophoto-rgb` `rec2020` `xyz`
- [x] Named color（`red` `rebeccapurple`）
- [x] CSS / SCSS / Less / Stylus variables
- [x] Extra expressions：bare RGB / HSL triplets、`--color-rgb: 255 0 0` shorthands
- [x] Tailwind theme color utilities：`bg-red-500` `text-sky-300` `hover:border-white/75`
- [x] Flutter/Dart：`Color(0xffRRGGBB)`、`Color.fromARGB(a, r, g, b)`
- [x] Hyprland：`rgba(rrggbb)`、`rgba(rrggbbaa)`
- [x] JSON / JSONC / `.tokens` Design Tokens：legacy color strings and DTCG structured colors
- [x] YAML Design Tokens：DTCG structured colors

## Tailwind CSS theme colors

Tailwind color utilities use one of two bundled palettes. The legacy palette
keeps existing Tailwind CSS v3 projects compatible, while the v4 palette comes
from Tailwind's official `tailwindcss/colors` export and includes its published
OKLCH values and color families.

`color-highlight.tailwindColorMode` controls palette selection:

- `auto` (the default) uses the v4 palette when the current document or a
  loaded theme source contains CSS-first v4 signals: a top-level `@theme`, an
  `@reference`, or `@import "tailwindcss"`. Without v4 signals it keeps the v3
  palette.
- `v3` always uses the legacy v3 palette, then applies custom theme
  declarations.
- `v4` always uses the official v4 palette, then applies custom theme
  declarations.

The extension reads top-level `@theme`, `@theme inline`, and `@theme static`
blocks in source order. Direct `--color-*` values and exact
`var(--color-other)` aliases create or replace utility colors. Both
`--color-*: initial` and `--*: initial` reset the color namespace, while
`--color-name: initial` removes one color. An inline theme alias may also
resolve through a regular custom property when that property has one
unambiguous selector/at-rule context. Nested or malformed theme blocks,
cycles, missing aliases, ambiguous properties, unsupported colors, and
composite values are skipped instead of guessed.

For markup and script documents, configure trusted theme sources with files,
directories, or glob patterns:

```jsonc
{
  "color-highlight.tailwindColorMode": "auto",
  "color-highlight.tailwindStylesheetPaths": [
    "./src/theme.css",
    "./src/styles",
    "./packages/*/theme.css",
  ],
}
```

The default empty `tailwindStylesheetPaths` array disables cross-file Tailwind
theme loading. Loading also requires workspace trust. Each highlight or
navigation load follows only relative CSS `@import` and `@reference`
dependencies and reads at most 32 theme files per request, to a maximum
dependency depth of 5, with a limit of 512 KiB per file. Package, HTTP, data,
absolute, non-CSS, unreadable, and over-limit dependencies are not followed.
An import of `tailwindcss` selects v4 in `auto` mode but does not read package
internals.

Supported utility syntax includes custom theme names, variants, gradients,
SVG colors, borders, rings, shadows, slash opacity, leading v3-compatible and
trailing v4 important modifiers, arbitrary colors such as `bg-[#50d71e]` and
`text-[oklch(...)]`, and custom-property shorthand such as
`bg-(--color-brand)`. Prefix variants such as `tw:hover:bg-red-600` and
trailing important utilities such as `bg-red-500!` are also recognized.
Incomplete dynamic template fragments, arbitrary expressions that are not a
complete supported color, malformed utilities, and negative color utilities
are ignored.

Go to Definition and Peek Definition for a Tailwind utility point to the final
custom `--color-*` declaration or uniquely resolved inline custom property.
This works in enabled markup, component, script, and style languages. Bundled
palette colors and arbitrary literal colors have no workspace definition, so
they do not produce a link. Navigation uses the same mode, source order,
resets, aliases, trust gate, configured paths, and loading bounds as color
highlighting.

The Tailwind compiler is not bundled or run. The extension does not execute
JavaScript configuration, plugins, or arbitrary project code, and it does not
search the workspace beyond configured theme paths and their bounded relative
dependencies. Workspace file access uses VS Code APIs so the same behavior is
available in desktop, Web, and virtual workspaces when the files are readable.

Cross-file CSS custom property resolution is conservative. It only runs when
`color-highlight.resolveCssVariablesAcrossFiles` is enabled, reads sources from
`color-highlight.cssVariablePaths`, and trusts declarations only from selectors
listed in `color-highlight.cssVariableTrustedSelectors`. Ambiguous runtime
cascade cases are skipped instead of guessed.

JSON and JSONC design token matching is conservative by default. It highlights
only `value` and `$value` string fields. To highlight any JSON string whose
complete value is a supported color, configure:

```jsonc
{
  "color-highlight.designTokenJsonMode": "strings",
}
```

Use `"all"` to allow both token fields and broad string matching. `"off"`
disables JSON, JSONC, and YAML design token matching.

DTCG color tokens are supported in JSON, JSONC, JSON-formatted `.tokens`, and
YAML. The structured
`$value` format accepts all 14 DTCG color spaces, inherited `$type: "color"`,
curly aliases such as `{palette.brand}`, local JSON Pointer `$ref` values, and
group `$root` tokens. For example:

```yaml
palette:
  $type: color
  brand:
    $value:
      colorSpace: display-p3
      components: [0.2, 0.45, 0.9]
      alpha: 0.9
  accent:
    $value: '{palette.brand}'
```

Relative cross-file references are opt-in. In a trusted workspace, enable the
setting and reference a JSON, JSONC, `.tokens`, or YAML token value:

```jsonc
{
  "color-highlight.resolveDesignTokensAcrossFiles": true,
  "brand": {
    "$type": "color",
    "$ref": "./tokens/palette.yaml#/palette/brand/$value",
  },
}
```

Only relative references are loaded, each resolution reads at most 64 unique
dependency files of up to 512 KiB, and external reads remain disabled in
untrusted workspaces.

## Color navigation

Go to Definition and Peek Definition are enabled by default for color-valued
references in CSS custom properties, SCSS variables, Less variables, Stylus
variables, and DTCG aliases or `$ref` values in JSON, JSONC, `.tokens`, YAML,
and YML.
References that are missing, cyclic, malformed, or do not ultimately resolve to
a supported color do not produce a definition.

CSS custom property navigation uses the reference's selector and at-rule
context. It prefers the latest declaration in the same context, and uses a
declaration from another context only when there is one conservative choice.
When multiple selector or at-rule contexts could win at runtime, navigation is
omitted instead of guessing.

Cross-file navigation follows the same opt-in and workspace-trust gates as
cross-file highlighting:

- CSS sources require `color-highlight.resolveCssVariablesAcrossFiles`, are
  read from `color-highlight.cssVariablePaths`, and must use a selector in
  `color-highlight.cssVariableTrustedSelectors`. Navigation reads at most 64
  source files of up to 512 KiB each.
- SCSS modules require `color-highlight.resolveScssVariablesAcrossFiles`;
  `color-highlight.scssLoadPaths` applies to non-relative modules. Resolution
  follows dependencies to a maximum depth of 5, reads at most 32 files, and
  limits each dependency to 512 KiB.
- DTCG `$ref` navigation requires
  `color-highlight.resolveDesignTokensAcrossFiles`, accepts only relative JSON,
  JSONC, JSON-formatted `.tokens`, YAML, or YML dependencies, reads at most 64
  unique dependency files, resolves at most 32 reference steps, and limits each
  external dependency to 512 KiB.

All cross-file reads are disabled in untrusted workspaces. To turn off Go to
Definition and Peek Definition while keeping color highlighting enabled, use:

```jsonc
{
  "color-highlight.enableColorNavigation": false,
}
```

When `color-highlight.enableHover` is enabled, each hover row shows compact
copy and replace icons for HEX, RGB, HSL, and OKLCH values. The alpha row can
decrease or increase transparency in 10 percentage point steps.

When `color-highlight.enableColorPicker` is enabled, detected colors are also
provided to VS Code's native color picker with HEX, RGB, HSL, and OKLCH
replacement presentations. It is disabled by default so the native swatch does
not appear alongside the extension's custom marker unless explicitly requested.

## Credits

This extension is implemented based on [naumovs/vscode-ext-color-highlight](https://github.com/naumovs/vscode-ext-color-highlight.git).
Thanks to the original project and its contributors for the foundation of the VS Code color highlighting experience.

## What is different

Compared with the original Color Highlight extension, this project keeps the familiar `color-highlight.*` settings namespace while expanding parser coverage, reducing false positives, and modernizing the extension internals.

- Modern TypeScript/ESM implementation with `reactive-vscode`, `tsdown`, `vitest`, `oxlint`, and `oxfmt`.
- Explicit enable/disable commands: `color-highlight.enable` and `color-highlight.disable`.
- More CSS Color 4 coverage, including whitespace syntax, slash alpha, `hwb()`, `lab()`, `lch()`, `oklab()`, `oklch()`, and `color()`.
- More accurate slash-alpha handling for `rgb()` / `rgba()` / `hsl()` / `hsla()` and shorthand color expressions.
- Safer hex detection: `#RGB` / `#RGBA` remain supported, while short numeric `0xabc` / `0xabcd` values are ignored to avoid number-literal false positives.
- Dart/Flutter colors: `Color(0xffRRGGBB)` and `Color.fromARGB(a, r, g, b)`.
- Hyprland `rgba(rrggbb)` and `rgba(rrggbbaa)` syntax.
- Transparent colors stay visible by rendering markers with an opaque display color while preserving the represented color value.
- Named CSS color matching is more configurable through `color-highlight.namedColorMatchMode`.
- Optional color hovers show HEX, RGB, HSL, OKLCH, and alpha details with copy actions when `color-highlight.enableHover` is enabled.
- Tailwind default theme color utilities are highlighted in markup and class strings.
- Large files are skipped by default through `color-highlight.maxFileSize` to avoid expensive full-document scans.
- Optional SCSS cross-file variable resolution through local `@use`, `@forward`, `@import`, directory indexes, nearest `node_modules`, and configured Sass load paths.
- VS Code Workspace FS based dependency reads, avoiding Node `fs` APIs in extension runtime.
- DTCG structured color tokens, local aliases, and opt-in trusted JSON/JSONC/YAML cross-file references.
- Broader test coverage, including parser regression tests and playground snapshots.

## Migration from Color Highlight

Most settings from `naumovs.color-highlight` can be kept as-is because this extension intentionally keeps the same `color-highlight.*` configuration namespace for compatible options.

| Original setting                               | In this extension                                          | Migration note                                                                                                                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `color-highlight.enable`                       | `color-highlight.enable`                                   | Keep as-is.                                                                                                                                                                    |
| `color-highlight.languages`                    | `color-highlight.languages`                                | Keep as-is. Supports `*` and `!languageId` exclusions.                                                                                                                         |
| `color-highlight.matchWords`                   | `color-highlight.matchWords`                               | Keep as-is for non-style languages. For style languages, also review `color-highlight.namedColorMatchMode`.                                                                    |
| `color-highlight.useARGB`                      | `color-highlight.useARGB`                                  | Keep as-is. This still controls whether 8-digit hex is interpreted as ARGB instead of RGBA.                                                                                    |
| `color-highlight.matchRgbWithNoFunction`       | `color-highlight.matchRgbWithNoFunction`                   | Keep as-is.                                                                                                                                                                    |
| `color-highlight.rgbWithNoFunctionLanguages`   | `color-highlight.rgbWithNoFunctionLanguages`               | Keep as-is.                                                                                                                                                                    |
| `color-highlight.matchHslWithNoFunction`       | `color-highlight.matchHslWithNoFunction`                   | Keep as-is.                                                                                                                                                                    |
| `color-highlight.hslWithNoFunctionLanguages`   | `color-highlight.hslWithNoFunctionLanguages`               | Keep as-is.                                                                                                                                                                    |
| `color-highlight.markerType`                   | `color-highlight.markerType`                               | Keep as-is. Supported values are `background`, `outline`, `foreground`, `underline`, `dot-before`, and `dot-after`.                                                            |
| `color-highlight.markRuler`                    | `color-highlight.markRuler`                                | Keep as-is.                                                                                                                                                                    |
| `color-highlight.sass.includePaths`            | `color-highlight.scssLoadPaths`                            | Rename this setting. Load paths are used for non-relative SCSS `@use`, `@forward`, and `@import` modules when `color-highlight.resolveScssVariablesAcrossFiles` is true.       |
| Not available                                  | `color-highlight.namedColorMatchMode`                      | New. Default `context` avoids highlighting selectors, variable names, and words like `@layer red`. Use `always` for broader non-style language matching or `never` to disable. |
| Not available                                  | `color-highlight.enableHover`                              | New. Default `false`. Enable to show color format details and copy actions on hover.                                                                                           |
| Not available                                  | `color-highlight.enableColorPicker`                        | New. Default `false`. Enable VS Code's native color swatch, picker, and replacement presentations.                                                                             |
| Not available                                  | `color-highlight.resolveScssVariablesAcrossFiles`          | New. Default `false`. Set to `true` to resolve SCSS variables across local `@use`, `@forward`, and `@import` files.                                                            |
| Not available                                  | `color-highlight.scssLoadPaths`                            | New. Default `[]`. Add absolute paths, or paths relative to the current SCSS file, for package-style Sass module resolution.                                                   |
| Not available                                  | `color-highlight.debug`                                    | New. Set to `true` to enable debug logging for detection and decoration.                                                                                                       |
| Command `extension.colorHighlight`             | Commands `color-highlight.enable` / `disable`              | Replace old command usage with the explicit enable/disable commands.                                                                                                           |
| Extension identifier `naumovs.color-highlight` | Extension identifier `ntnyq.vscode-better-color-highlight` | Install this extension and disable/uninstall the original one to avoid duplicate decorations.                                                                                  |

Suggested migration example:

```jsonc
{
  "color-highlight.languages": ["*", "!markdown"],
  "color-highlight.markerType": "background",
  "color-highlight.matchWords": false,
  "color-highlight.namedColorMatchMode": "context",
  "color-highlight.enableHover": false,
  "color-highlight.enableColorPicker": false,
  "color-highlight.resolveScssVariablesAcrossFiles": false,
  "color-highlight.scssLoadPaths": [],
  "color-highlight.resolveCssVariablesAcrossFiles": false,
  "color-highlight.resolveDesignTokensAcrossFiles": false,
  "color-highlight.cssVariablePaths": [],
  "color-highlight.cssVariableTrustedSelectors": [
    ":root",
    "html",
    "body",
    ":host",
  ],
  "color-highlight.maxFileSize": 1000000,
}
```

If you want broader named-color matching outside style-language syntax, use:

```jsonc
{
  "color-highlight.matchWords": true,
  "color-highlight.namedColorMatchMode": "always",
}
```

## VS Code Web

This extension supports browser-based VS Code environments, including [vscode.dev](https://vscode.dev) and [github.dev](https://github.dev).
Runtime file access uses the VS Code Workspace FS API, so SCSS dependency resolution can work with web and virtual workspace file systems when those files are readable by VS Code.

## License

[MIT](./LICENSE) License © 2026-PRESENT [ntnyq](https://github.com/ntnyq)

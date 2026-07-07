# vscode-better-color-highlight

[![GitHub release](https://img.shields.io/github/v/release/ntnyq/vscode-better-color-highlight?include_prereleases&label=Visual%20Studio%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=ntnyq.vscode-better-color-highlight)
[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/ntnyq/vscode-better-color-highlight/ci.yml?branch=main)](https://github.com/ntnyq/vscode-better-color-highlight/actions/workflows/ci.yml)
[![GitHub top language](https://img.shields.io/github/languages/top/ntnyq/vscode-better-color-highlight)](https://github.com/ntnyq/vscode-better-color-highlight)
[![GitHub](https://img.shields.io/github/license/ntnyq/vscode-better-color-highlight)](https://github.com/ntnyq/vscode-better-color-highlight/blob/main/LICENSE)

Highlight and preview colors in multiple formats across code, comments, and strings.

## Commands

<!-- commands -->

| Command                               | Title                                           |
| ------------------------------------- | ----------------------------------------------- |
| `color-highlight.enable`              | Color Highlight: Enable Better Color Highlight  |
| `color-highlight.disable`             | Color Highlight: Disable Better Color Highlight |
| `color-highlight.copyColorAsHex`      | Color Highlight: Copy Color as HEX              |
| `color-highlight.copyColorAsRgb`      | Color Highlight: Copy Color as RGB              |
| `color-highlight.copyColorAsHsl`      | Color Highlight: Copy Color as HSL              |
| `color-highlight.copyColorAsOklch`    | Color Highlight: Copy Color as OKLCH            |
| `color-highlight.replaceColorAsHex`   | Color Highlight: Replace Color as HEX           |
| `color-highlight.replaceColorAsRgb`   | Color Highlight: Replace Color as RGB           |
| `color-highlight.replaceColorAsHsl`   | Color Highlight: Replace Color as HSL           |
| `color-highlight.replaceColorAsOklch` | Color Highlight: Replace Color as OKLCH         |
| `color-highlight.adjustColorAlpha`    | Color Highlight: Adjust Color Alpha             |

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

#### `color-highlight.designTokenJsonMode`

Description: Controls JSON and JSONC design token color matching. 'token-values' matches value and $value string fields, 'strings' matches any color string value, 'all' enables both modes, and 'off' disables JSON token matching.  
Type: `string`  
Default: `"token-values"`

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
- [x] JSON / JSONC Design Tokens：`value` / `$value` color strings
- [ ] YAML Design Tokens

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

Use `"all"` to allow both token fields and broad string matching, or `"off"` to
disable JSON token matching.

When `color-highlight.enableHover` is enabled, each hover row shows compact
copy and replace icons for HEX, RGB, HSL, and OKLCH values. The alpha row can
decrease or increase transparency in 10 percentage point steps.

Tailwind theme color matching highlights static default color utilities such as
`bg-red-500`, `text-sky-300`, `from-purple-400`, and `ring-white/75`,
including common variant prefixes like `hover:` and `dark:`. Custom Tailwind
`@theme` declarations are still highlighted through their underlying CSS color
values, for example `--color-brand-500: oklch(...)`.

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
  "color-highlight.resolveScssVariablesAcrossFiles": false,
  "color-highlight.scssLoadPaths": [],
  "color-highlight.resolveCssVariablesAcrossFiles": false,
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

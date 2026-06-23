# vscode-better-color-highlight

[![GitHub release](https://img.shields.io/github/v/release/ntnyq/vscode-better-color-highlight?include_prereleases&label=Visual%20Studio%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=ntnyq.vscode-better-color-highlight)
[![GitHub Workflow Status](https://img.shields.io/github/workflow/status/ntnyq/vscode-better-color-highlight/CI)](https://github.com/ntnyq/vscode-better-color-highlight/actions/workflows/ci.yml)
[![GitHub top language](https://img.shields.io/github/languages/top/ntnyq/vscode-better-color-highlight)](https://github.com/ntnyq/vscode-better-color-highlight)
[![GitHub](https://img.shields.io/github/license/ntnyq/vscode-better-color-highlight)](https://github.com/ntnyq/vscode-better-color-highlight/blob/master/LICENSE)

Highlight and preview colors in multiple formats across code, comments, and strings.

## Commands

<!-- commands -->

| Command                   | Title                                           |
| ------------------------- | ----------------------------------------------- |
| `color-highlight.enable`  | Color Highlight: Enable Better Color Highlight  |
| `color-highlight.disable` | Color Highlight: Disable Better Color Highlight |

<!-- commands -->

## Configs

<!-- configs -->

| Key                                               | Description                                                                                                                                                               | Type      | Default        |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | -------------- |
| `color-highlight.enable`                          | Enable or disable color highlighting.                                                                                                                                     | `boolean` | `true`         |
| `color-highlight.languages`                       | Language IDs where colors are highlighted. Use '\*' for all languages, prefix with '!' to exclude.                                                                        | `array`   | `["*"]`        |
| `color-highlight.matchWords`                      | Highlight named CSS colors (e.g., 'red', 'blue') in non-style languages.                                                                                                  | `boolean` | `false`        |
| `color-highlight.namedColorMatchMode`             | Controls named CSS color matching. 'context' matches style-language declaration values, 'always' matches any named color word, and 'never' disables named color matching. | `string`  | `"context"`    |
| `color-highlight.resolveScssVariablesAcrossFiles` | Resolve SCSS variables through local @use, @forward, and @import dependencies. Disabled by default to avoid extra file-system work.                                       | `boolean` | `false`        |
| `color-highlight.scssLoadPaths`                   | Additional Sass load paths for resolving non-relative SCSS @use, @forward, and @import modules.                                                                           | `array`   | `[]`           |
| `color-highlight.useARGB`                         | Interpret 8-digit hex colors as ARGB instead of RGBA.                                                                                                                     | `boolean` | `false`        |
| `color-highlight.matchRgbWithNoFunction`          | Highlight RGB values not wrapped in rgb() function.                                                                                                                       | `boolean` | `false`        |
| `color-highlight.rgbWithNoFunctionLanguages`      | Language IDs for rgb-without-function matching. Use '\*' / '!' syntax.                                                                                                    | `array`   | `["*"]`        |
| `color-highlight.matchHslWithNoFunction`          | Highlight HSL values not wrapped in hsl() function.                                                                                                                       | `boolean` | `false`        |
| `color-highlight.hslWithNoFunctionLanguages`      | Language IDs for hsl-without-function matching. Use '\*' / '!' syntax.                                                                                                    | `array`   | `["*"]`        |
| `color-highlight.markerType`                      | Style of the color highlight marker.                                                                                                                                      | `string`  | `"background"` |
| `color-highlight.markRuler`                       | Show color indicators on the scrollbar ruler.                                                                                                                             | `boolean` | `true`         |
| `color-highlight.debug`                           | Enable debug logging for color detection and decoration.                                                                                                                  | `boolean` | `false`        |

<!-- configs -->

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
- [x] Flutter/Dart：`Color(0xffRRGGBB)`、`Color.fromARGB(a, r, g, b)`
- [x] Hyprland：`rgba(rrggbb)`、`rgba(rrggbbaa)`
- [ ] Design tokens：Tailwind、tokens（JSON/YAML）

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
- Optional SCSS cross-file variable resolution through local `@use`, `@forward`, `@import`, directory indexes, nearest `node_modules`, and configured Sass load paths.
- Broader test coverage, including parser regression tests and playground snapshots.

## Migration from Color Highlight

Most settings from `naumovs.color-highlight` can be kept as-is because this extension intentionally keeps the same `color-highlight.*` configuration namespace for compatible options.

| Original setting                               | In this extension                                          | Migration note                                                                                                                                                           |
| ---------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `color-highlight.enable`                       | `color-highlight.enable`                                   | Keep as-is.                                                                                                                                                              |
| `color-highlight.languages`                    | `color-highlight.languages`                                | Keep as-is. Supports `*` and `!languageId` exclusions.                                                                                                                   |
| `color-highlight.matchWords`                   | `color-highlight.matchWords`                               | Keep as-is for non-style languages. For style languages, also review `color-highlight.namedColorMatchMode`.                                                              |
| `color-highlight.useARGB`                      | `color-highlight.useARGB`                                  | Keep as-is. This still controls whether 8-digit hex is interpreted as ARGB instead of RGBA.                                                                              |
| `color-highlight.matchRgbWithNoFunction`       | `color-highlight.matchRgbWithNoFunction`                   | Keep as-is.                                                                                                                                                              |
| `color-highlight.rgbWithNoFunctionLanguages`   | `color-highlight.rgbWithNoFunctionLanguages`               | Keep as-is.                                                                                                                                                              |
| `color-highlight.matchHslWithNoFunction`       | `color-highlight.matchHslWithNoFunction`                   | Keep as-is.                                                                                                                                                              |
| `color-highlight.hslWithNoFunctionLanguages`   | `color-highlight.hslWithNoFunctionLanguages`               | Keep as-is.                                                                                                                                                              |
| `color-highlight.markerType`                   | `color-highlight.markerType`                               | Keep as-is. Supported values are `background`, `outline`, `foreground`, `underline`, `dot-before`, and `dot-after`.                                                      |
| `color-highlight.markRuler`                    | `color-highlight.markRuler`                                | Keep as-is.                                                                                                                                                              |
| `color-highlight.sass.includePaths`            | `color-highlight.scssLoadPaths`                            | Rename this setting. Load paths are used for non-relative SCSS `@use`, `@forward`, and `@import` modules when `color-highlight.resolveScssVariablesAcrossFiles` is true. |
| Not available                                  | `color-highlight.namedColorMatchMode`                      | New. Default `context` avoids highlighting selectors, variable names, and words like `@layer red`. Use `always` for legacy broad matching or `never` to disable.         |
| Not available                                  | `color-highlight.resolveScssVariablesAcrossFiles`          | New. Default `false`. Set to `true` to resolve SCSS variables across local `@use`, `@forward`, and `@import` files.                                                      |
| Not available                                  | `color-highlight.scssLoadPaths`                            | New. Default `[]`. Add absolute paths, or paths relative to the current SCSS file, for package-style Sass module resolution.                                             |
| Not available                                  | `color-highlight.debug`                                    | New. Set to `true` to enable debug logging for detection and decoration.                                                                                                 |
| Command `extension.colorHighlight`             | Commands `color-highlight.enable` / `disable`              | Replace old command usage with the explicit enable/disable commands.                                                                                                     |
| Extension identifier `naumovs.color-highlight` | Extension identifier `ntnyq.vscode-better-color-highlight` | Install this extension and disable/uninstall the original one to avoid duplicate decorations.                                                                            |

Suggested migration example:

```jsonc
{
  "color-highlight.languages": ["*", "!markdown"],
  "color-highlight.markerType": "background",
  "color-highlight.matchWords": false,
  "color-highlight.namedColorMatchMode": "context",
  "color-highlight.resolveScssVariablesAcrossFiles": false,
  "color-highlight.scssLoadPaths": [],
}
```

If you want behavior closer to the original broad named-color matching, use:

```jsonc
{
  "color-highlight.matchWords": true,
  "color-highlight.namedColorMatchMode": "always",
}
```

## License

[MIT](./LICENSE) License © 2026-PRESENT [ntnyq](https://github.com/ntnyq)

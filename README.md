# vscode-better-color-highlight

[![GitHub release](https://img.shields.io/github/v/release/ntnyq/vscode-better-color-highlight?include_prereleases&label=Visual%20Studio%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=ntnyq.vscode-better-color-highlight)
[![GitHub Workflow Status](https://img.shields.io/github/workflow/status/ntnyq/vscode-better-color-highlight/CI)](https://github.com/ntnyq/vscode-better-color-highlight/actions/workflows/ci.yml)
[![GitHub top language](https://img.shields.io/github/languages/top/ntnyq/vscode-better-color-highlight)](https://github.com/ntnyq/vscode-better-color-highlight)
[![GitHub](https://img.shields.io/github/license/ntnyq/vscode-better-color-highlight)](https://github.com/ntnyq/vscode-better-color-highlight/blob/master/LICENSE)

Highlight and preview colors in multiple formats across code, comments, and strings.

### Commands

<!-- commands -->

| Command                   | Title                                           |
| ------------------------- | ----------------------------------------------- |
| `color-highlight.enable`  | Color Highlight: Enable Better Color Highlight  |
| `color-highlight.disable` | Color Highlight: Disable Better Color Highlight |

<!-- commands -->

### Configs

<!-- configs -->

| Key                                          | Description                                                                                        | Type      | Default        |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------- | -------------- |
| `color-highlight.enable`                     | Enable or disable color highlighting.                                                              | `boolean` | `true`         |
| `color-highlight.languages`                  | Language IDs where colors are highlighted. Use '\*' for all languages, prefix with '!' to exclude. | `array`   | `["*"]`        |
| `color-highlight.matchWords`                 | Highlight named CSS colors (e.g., 'red', 'blue') in all file types.                                | `boolean` | `false`        |
| `color-highlight.useARGB`                    | Interpret 8-digit hex colors as ARGB instead of RGBA.                                              | `boolean` | `false`        |
| `color-highlight.matchRgbWithNoFunction`     | Highlight RGB values not wrapped in rgb() function.                                                | `boolean` | `false`        |
| `color-highlight.rgbWithNoFunctionLanguages` | Language IDs for rgb-without-function matching. Use '\*' / '!' syntax.                             | `array`   | `["*"]`        |
| `color-highlight.matchHslWithNoFunction`     | Highlight HSL values not wrapped in hsl() function.                                                | `boolean` | `false`        |
| `color-highlight.hslWithNoFunctionLanguages` | Language IDs for hsl-without-function matching. Use '\*' / '!' syntax.                             | `array`   | `["*"]`        |
| `color-highlight.markerType`                 | Style of the color highlight marker.                                                               | `string`  | `"background"` |
| `color-highlight.markRuler`                  | Show color indicators on the scrollbar ruler.                                                      | `boolean` | `true`         |

<!-- configs -->

## Supported color format

<!-- cSpell: disable-next-line -->

- [ ] Hex：`#RGB` `#RRGGBB` `#RGBA` `#RRGGBBAA`
- [ ] `rgb()` / `rgba()`（whitespace, comma and backslash）
- [ ] `hsl()` / `hsla()`（percentage and angle）
- [ ] `hwb()`
- [ ] `lab()` / `lch()`
- [ ] `oklab()` / `oklch()`
- [ ] `color()`：`display-p3` `rec2020`
- [ ] Named color（`red` `rebeccapurple`）
- [ ] CSS variables：`var(--color)`
- [ ] Design tokens：Tailwind、tokens（JSON/YAML）

## License

[MIT](./LICENSE) License © 2026-PRESENT [ntnyq](https://github.com/ntnyq)

// oxlint-disable-next-line unicorn/no-abusive-eslint-disable
/* oxlint-disable */
/* oxfmt-disable */
// =============================================
// ANSI SGR Colors
// =============================================

// Basic and bright palette colors.
const basicForeground = String.raw`\x1b[31mbasic foreground\x1b[0m`
const basicBackground = String.raw`\u001b[44mbasic background\u001b[0m`
const brightForeground = String.raw`\u{1b}[93mbright foreground\u{1b}[0m`
const brightBackground = String.raw`\033[104mbright background\033[0m`

// 256-color palette indexes.
const indexedForeground = String.raw`\e[38;5;201mindexed foreground\e[0m`
const indexedBackground = String.raw`\x1B[48;5;21mindexed background\x1B[0m`

// 24-bit truecolor with semicolon- and colon-delimited parameters.
const truecolorForeground = String.raw`\x1b[38;2;57;197;187mtruecolor foreground\x1b[0m`
const truecolorBackground = String.raw`\u001b[48:2::239:202:25mtruecolor background\u001b[0m`

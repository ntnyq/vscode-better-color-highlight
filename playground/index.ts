// oxlint-disable-next-line unicorn/no-abusive-eslint-disable
/* oxlint-disable */
/* oxfmt-disable */
// =============================================
// Hex Colors
// =============================================

// #RGB — 3-digit hex
const hex3 = '#f00'
const hex3b = '#0f0'
const hex3c = '#00f'

// #RRGGBB — 6-digit hex
const hex6 = '#ff0000'
const hex6b = '#00ff00'
const hex6c = '#0000ff'

// #RGBA — 4-digit hex (RGBA mode)
const hex4 = '#f00f'
const hex4b = '#0f0c'
const hex4c = '#00f8'

// #RRGGBBAA — 8-digit hex (RGBA mode)
const hex8 = '#ff000080'
const hex8b = '#00ff00cc'
const hex8c = '#0000ffff'

// 0x prefix hex
const hex0x = 0xff0000
const hex0xb = 0x00ff00

// =============================================
// RGB / RGBA Functions
// =============================================

// rgb() comma syntax
const rgbComma = 'rgb(255, 0, 0)'
const rgbCommaB = 'rgb(0, 128, 255)'

// rgba() comma syntax
const rgbaComma = 'rgba(255, 0, 0, 1)'
const rgbaCommaB = 'rgba(0, 128, 255, 0.5)'

// rgb() space syntax
const rgbSpace = 'rgb(255 0 0)'
const rgbSpaceB = 'rgb(0 128 255)'

// rgba() space + slash alpha
const rgbaSpace = 'rgb(255 0 0 / 1)'
const rgbaSpaceB = 'rgb(0 128 255 / 0.5)'

// =============================================
// HSL / HSLA Functions
// =============================================

// hsl() comma syntax
const hslComma = 'hsl(0, 100%, 50%)'
const hslCommaB = 'hsl(210, 50%, 50%)'

// hsla() comma syntax
const hslaComma = 'hsla(0, 100%, 50%, 1)'
const hslaCommaB = 'hsla(210, 50%, 50%, 0.5)'

// hsl() space syntax
const hslSpace = 'hsl(0 100% 50%)'
const hslSpaceB = 'hsl(210 50% 50%)'

// hsla() space + slash alpha
const hslaSpace = 'hsl(0 100% 50% / 1)'
const hslaSpaceB = 'hsl(210 50% 50% / 0.5)'

// =============================================
// HWB Function
// =============================================

// hwb() comma syntax
const hwbComma = 'hwb(0, 0%, 0%)'
const hwbCommaB = 'hwb(210, 20%, 30%)'

// hwb() space syntax
const hwbSpace = 'hwb(0 0% 0%)'

// hwb() with alpha
const hwbAlpha = 'hwb(0, 0%, 0%, 0.5)'

// =============================================
// LCH Function
// =============================================

// lch()
const lch = 'lch(50, 30, 0)'
const lchB = 'lch(70, 40, 120)'

// lcha() with alpha
const lcha = 'lcha(50, 30, 0, 0.5)'

// =============================================
// OKLCH Function
// =============================================

// oklch()
const oklch = 'oklch(0.5, 0.15, 0)'
const oklchB = 'oklch(0.7, 0.2, 200)'

// oklcha() with alpha
const oklcha = 'oklcha(0.5, 0.15, 0, 0.5)'

// =============================================
// LAB Function
// =============================================

// lab()
const lab = 'lab(50, 0, 0)'
const labB = 'lab(70, 20, -30)'

// laba() with alpha
const laba = 'laba(50, 0, 0, 0.5)'

// =============================================
// OKLab Function
// =============================================

// oklab()
const oklab = 'oklab(0.5, 0, 0)'
const oklabB = 'oklab(0.7, 0.1, -0.05)'

// oklaba() with alpha
const oklaba = 'oklaba(0.5, 0, 0, 0.5)'

// =============================================
// Named Colors
// =============================================

// Basic named colors
const namedRed = 'red'
const namedBlue = 'blue'
const namedGreen = 'green'

// Extended named colors
const namedRebeccapurple = 'rebeccapurple'
const namedCoral = 'coral'
const namedTeal = 'teal'

// =============================================
// Colors in comments (should be highlighted)
// =============================================

// TODO: use #ff0000 for the primary
// NOTE: the accent is rgb(128, 0, 128)
// FIXME: hsl(210, 50%, 50%) should be the background

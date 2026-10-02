export type CssColorSpace =
  | 'a98-rgb'
  | 'display-p3'
  | 'display-p3-linear'
  | 'hsl'
  | 'hwb'
  | 'lab'
  | 'lch'
  | 'oklab'
  | 'oklch'
  | 'prophoto-rgb'
  | 'rec2020'
  | 'srgb'
  | 'srgb-linear'
  | 'xyz-d50'
  | 'xyz-d65'

export type ColorChannels = [number, number, number]
export type MissingColorComponents = [boolean, boolean, boolean, boolean]

export interface CssColorValue {
  readonly alpha: number
  readonly channels: ColorChannels
  readonly missing: MissingColorComponents
  readonly space: CssColorSpace
}

type ComponentCategory =
  | 'blackness'
  | 'blue'
  | 'colorfulness'
  | 'green'
  | 'hue'
  | 'lightness'
  | 'opponent-a'
  | 'opponent-b'
  | 'red'
  | 'whiteness'

type Matrix3x3 = [ColorChannels, ColorChannels, ColorChannels]

const D50_REFERENCE_WHITE: ColorChannels = [0.964295676, 1, 0.825104603]
const POLAR_SPACES: ReadonlySet<CssColorSpace> = new Set([
  'hsl',
  'hwb',
  'lch',
  'oklch',
])
const RGB_COMPONENTS: readonly ComponentCategory[] = ['red', 'green', 'blue']
const COMPONENT_CATEGORIES: Readonly<
  Record<CssColorSpace, readonly ComponentCategory[]>
> = {
  'a98-rgb': RGB_COMPONENTS,
  'display-p3': RGB_COMPONENTS,
  'display-p3-linear': RGB_COMPONENTS,
  hsl: ['hue', 'colorfulness', 'lightness'],
  hwb: ['hue', 'whiteness', 'blackness'],
  lab: ['lightness', 'opponent-a', 'opponent-b'],
  lch: ['lightness', 'colorfulness', 'hue'],
  oklab: ['lightness', 'opponent-a', 'opponent-b'],
  oklch: ['lightness', 'colorfulness', 'hue'],
  'prophoto-rgb': RGB_COMPONENTS,
  rec2020: RGB_COMPONENTS,
  srgb: RGB_COMPONENTS,
  'srgb-linear': RGB_COMPONENTS,
  'xyz-d50': RGB_COMPONENTS,
  'xyz-d65': RGB_COMPONENTS,
}

/**
 * Whether a CSS color space uses a cylindrical hue component.
 */
export function isPolarColorSpace(space: CssColorSpace): boolean {
  return POLAR_SPACES.has(space)
}

/**
 * Index of a polar color space's hue channel.
 */
export function getHueChannelIndex(space: CssColorSpace): number | null {
  switch (space) {
    case 'hsl':
    case 'hwb': {
      return 0
    }
    case 'lch':
    case 'oklch': {
      return 2
    }
    default: {
      return null
    }
  }
}

/**
 * Convert a high-precision color value without clipping intermediate channels.
 */
export function convertCssColor(
  color: CssColorValue,
  targetSpace: CssColorSpace,
  options: { readonly preservePowerless?: boolean } = {},
): CssColorValue {
  const sourceMissing = options.preservePowerless
    ? color.missing
    : getEffectiveMissing(color)
  if (color.space === targetSpace) {
    return { ...color, missing: sourceMissing }
  }

  const channels = convertChannels(color.space, targetSpace, color.channels)
  const missing = convertMissingComponents(
    color.space,
    targetSpace,
    sourceMissing,
  )
  if (!options.preservePowerless) {
    const targetPowerless = getPowerlessComponents(targetSpace, channels)
    for (let index = 0; index < 3; index++) {
      missing[index] ||= targetPowerless[index]
    }
  }

  return {
    alpha: color.alpha,
    channels,
    missing,
    space: targetSpace,
  }
}

/**
 * Convert channels directly where supported or through XYZ D65.
 */
function convertChannels(
  sourceSpace: CssColorSpace,
  targetSpace: CssColorSpace,
  channels: ColorChannels,
): ColorChannels {
  if (sourceSpace === 'hsl' && targetSpace === 'srgb') {
    return hslToSrgb(channels)
  }
  if (sourceSpace === 'hwb' && targetSpace === 'srgb') {
    return hwbToSrgb(channels)
  }
  if (sourceSpace === 'srgb' && targetSpace === 'hsl') {
    return srgbToHsl(channels)
  }
  if (sourceSpace === 'srgb' && targetSpace === 'hwb') {
    return srgbToHwb(channels)
  }
  return fromXyzD65(targetSpace, toXyzD65(sourceSpace, channels))
}

/**
 * Create an opaque or translucent color with no missing components.
 */
export function createCssColor(
  space: CssColorSpace,
  channels: ColorChannels,
  alpha = 1,
  missing: MissingColorComponents = [false, false, false, false],
): CssColorValue {
  return { alpha, channels, missing, space }
}

/**
 * Normalize a hue to the [0, 360) interval.
 */
export function normalizeHue(value: number): number {
  return ((value % 360) + 360) % 360
}

/**
 * Transfer missing-component flags between analogous color-space channels.
 */
function convertMissingComponents(
  sourceSpace: CssColorSpace,
  targetSpace: CssColorSpace,
  sourceMissing: MissingColorComponents,
): MissingColorComponents {
  const sourceCategories = COMPONENT_CATEGORIES[sourceSpace]
  const targetCategories = COMPONENT_CATEGORIES[targetSpace]
  const missing: MissingColorComponents = [
    false,
    false,
    false,
    sourceMissing[3],
  ]
  const analogousSource = new Set<number>()
  const analogousTarget = new Set<number>()

  for (let targetIndex = 0; targetIndex < 3; targetIndex++) {
    const sourceIndex = sourceCategories.indexOf(
      targetCategories[targetIndex] as ComponentCategory,
    )
    if (sourceIndex === -1) {
      continue
    }

    analogousSource.add(sourceIndex)
    analogousTarget.add(targetIndex)
    missing[targetIndex] = sourceMissing[sourceIndex]
  }

  const remainingSource = [0, 1, 2].filter(index => !analogousSource.has(index))
  const remainingTarget = [0, 1, 2].filter(index => !analogousTarget.has(index))
  if (
    remainingSource.length > 0 &&
    remainingSource.every(index => sourceMissing[index])
  ) {
    for (const index of remainingTarget) {
      missing[index] = true
    }
  }

  return missing
}

/**
 * Combine explicit missing flags with powerless components for interpolation.
 */
function getEffectiveMissing(color: CssColorValue): MissingColorComponents {
  const missing = [...color.missing] as MissingColorComponents
  const powerless = getPowerlessComponents(color.space, color.channels)
  for (let index = 0; index < 3; index++) {
    missing[index] ||= powerless[index]
  }
  return missing
}

/**
 * Identify hue components that have no effect at the current channel values.
 */
function getPowerlessComponents(
  space: CssColorSpace,
  channels: ColorChannels,
): MissingColorComponents {
  const missing: MissingColorComponents = [false, false, false, false]
  switch (space) {
    case 'hsl': {
      missing[0] = channels[1] <= 0.00001
      break
    }
    case 'hwb': {
      missing[0] = channels[1] + channels[2] >= 0.99999
      break
    }
    case 'lch':
    case 'oklch': {
      missing[2] = Math.abs(channels[1]) < 1e-12
      break
    }
  }
  return missing
}

/**
 * Convert supported color-space channels to XYZ with a D65 white point.
 */
function toXyzD65(
  space: CssColorSpace,
  channels: ColorChannels,
): ColorChannels {
  switch (space) {
    case 'srgb': {
      return linearSrgbToXyz(channels.map(srgbToLinear) as ColorChannels)
    }
    case 'srgb-linear': {
      return linearSrgbToXyz(channels)
    }
    case 'display-p3': {
      return multiplyMatrixAndVector(
        [
          [0.48657095, 0.26566769, 0.19821729],
          [0.22897456, 0.69173852, 0.07928691],
          [0, 0.04511338, 1.04394437],
        ],
        channels.map(srgbToLinear) as ColorChannels,
      )
    }
    case 'display-p3-linear': {
      return multiplyMatrixAndVector(
        [
          [0.48657095, 0.26566769, 0.19821729],
          [0.22897456, 0.69173852, 0.07928691],
          [0, 0.04511338, 1.04394437],
        ],
        channels,
      )
    }
    case 'a98-rgb': {
      return multiplyMatrixAndVector(
        [
          [0.5767309, 0.185554, 0.1881852],
          [0.2973769, 0.6273491, 0.0752741],
          [0.0270343, 0.0706872, 0.9911085],
        ],
        channels.map(a98RgbToLinear) as ColorChannels,
      )
    }
    case 'prophoto-rgb': {
      const xyzD50 = multiplyMatrixAndVector(
        [
          [0.7976749, 0.1351917, 0.0313534],
          [0.2880402, 0.7118741, 0.0000857],
          [0, 0, 0.82521],
        ],
        channels.map(prophotoToLinear) as ColorChannels,
      )
      return adaptD50ToD65(xyzD50)
    }
    case 'rec2020': {
      return multiplyMatrixAndVector(
        [
          [0.63695805, 0.1446169, 0.16888098],
          [0.26270021, 0.67799807, 0.05930172],
          [0, 0.02807269, 1.06098506],
        ],
        channels.map(rec2020ToLinear) as ColorChannels,
      )
    }
    case 'xyz-d65': {
      return channels
    }
    case 'xyz-d50': {
      return adaptD50ToD65(channels)
    }
    case 'lab': {
      return adaptD50ToD65(labToXyzD50(channels))
    }
    case 'lch': {
      return adaptD50ToD65(labToXyzD50(lchToLab(channels)))
    }
    case 'oklab': {
      return linearSrgbToXyz(oklabToLinearSrgb(channels))
    }
    case 'oklch': {
      return linearSrgbToXyz(oklabToLinearSrgb(lchToLab(channels)))
    }
    case 'hsl': {
      return toXyzD65('srgb', hslToSrgb(channels))
    }
    case 'hwb': {
      return toXyzD65('srgb', hwbToSrgb(channels))
    }
  }
}

/**
 * Convert XYZ D65 channels to a supported target color space.
 */
function fromXyzD65(space: CssColorSpace, xyz: ColorChannels): ColorChannels {
  switch (space) {
    case 'srgb': {
      return xyzToLinearSrgb(xyz).map(linearToSrgb) as ColorChannels
    }
    case 'srgb-linear': {
      return xyzToLinearSrgb(xyz)
    }
    case 'display-p3':
    case 'display-p3-linear': {
      const linear = multiplyMatrixAndVector(
        [
          [2.49349691, -0.93138362, -0.40271078],
          [-0.82948897, 1.76266406, 0.02362469],
          [0.03584583, -0.07617239, 0.95688452],
        ],
        xyz,
      )
      return space === 'display-p3'
        ? (linear.map(linearToSrgb) as ColorChannels)
        : linear
    }
    case 'a98-rgb': {
      return multiplyMatrixAndVector(
        [
          [2.041369, -0.5649464, -0.3446944],
          [-0.969266, 1.8760108, 0.041556],
          [0.0134474, -0.1183897, 1.0154096],
        ],
        xyz,
      ).map(linearToA98Rgb) as ColorChannels
    }
    case 'prophoto-rgb': {
      return multiplyMatrixAndVector(
        [
          [1.3459433, -0.2556075, -0.0511118],
          [-0.5445989, 1.5081673, 0.0205351],
          [0, 0, 1.2118128],
        ],
        adaptD65ToD50(xyz),
      ).map(linearToProphoto) as ColorChannels
    }
    case 'rec2020': {
      return multiplyMatrixAndVector(
        [
          [1.71665119, -0.35567078, -0.25336628],
          [-0.66668435, 1.61648124, 0.01576855],
          [0.01763986, -0.04277061, 0.94210312],
        ],
        xyz,
      ).map(linearToRec2020) as ColorChannels
    }
    case 'xyz-d65': {
      return xyz
    }
    case 'xyz-d50': {
      return adaptD65ToD50(xyz)
    }
    case 'lab': {
      return xyzD50ToLab(adaptD65ToD50(xyz))
    }
    case 'lch': {
      return labToLch(xyzD50ToLab(adaptD65ToD50(xyz)))
    }
    case 'oklab': {
      return linearSrgbToOklab(xyzToLinearSrgb(xyz))
    }
    case 'oklch': {
      return labToLch(linearSrgbToOklab(xyzToLinearSrgb(xyz)))
    }
    case 'hsl': {
      return srgbToHsl(fromXyzD65('srgb', xyz))
    }
    case 'hwb': {
      return srgbToHwb(fromXyzD65('srgb', xyz))
    }
  }
}

/**
 * Transform linear sRGB channels to XYZ D65.
 */
function linearSrgbToXyz(channels: ColorChannels): ColorChannels {
  return multiplyMatrixAndVector(
    [
      [0.4123908, 0.35758434, 0.18048079],
      [0.212639, 0.71516868, 0.07219232],
      [0.01933082, 0.11919478, 0.95053215],
    ],
    channels,
  )
}

/**
 * Transform XYZ D65 channels to linear sRGB.
 */
function xyzToLinearSrgb(xyz: ColorChannels): ColorChannels {
  return multiplyMatrixAndVector(
    [
      [3.2409699419045226, -1.537383177570094, -0.4986107602930034],
      [-0.9692436362808796, 1.8759675015077202, 0.04155505740717559],
      [0.05563007969699366, -0.20397695888897652, 1.0569715142428786],
    ],
    xyz,
  )
}

/**
 * Adapt XYZ channels from the D50 white point to D65.
 */
function adaptD50ToD65(xyz: ColorChannels): ColorChannels {
  return multiplyMatrixAndVector(
    [
      [0.9555766, -0.0230393, 0.0631636],
      [-0.0282895, 1.0099416, 0.0210077],
      [0.0122982, -0.020483, 1.3299098],
    ],
    xyz,
  )
}

/**
 * Adapt XYZ channels from the D65 white point to D50.
 */
function adaptD65ToD50(xyz: ColorChannels): ColorChannels {
  return multiplyMatrixAndVector(
    [
      [1.0478112, 0.0228866, -0.050127],
      [0.0295424, 0.9904844, -0.0170491],
      [-0.0092345, 0.0150436, 0.7521316],
    ],
    xyz,
  )
}

/**
 * Convert Lab channels to XYZ using the D50 reference white.
 */
function labToXyzD50([lightness, a, b]: ColorChannels): ColorChannels {
  const fy = (lightness + 16) / 116
  const fx = fy + a / 500
  const fz = fy - b / 200
  return [fx, fy, fz].map(
    (coordinate, index) => D50_REFERENCE_WHITE[index] * labFInv(coordinate),
  ) as ColorChannels
}

/**
 * Convert XYZ D50 channels to Lab.
 */
function xyzD50ToLab(xyz: ColorChannels): ColorChannels {
  const [fx, fy, fz] = xyz.map((coordinate, index) =>
    labF(coordinate / D50_REFERENCE_WHITE[index]),
  ) as ColorChannels
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

/**
 * Convert polar lightness, chroma, and hue to Cartesian Lab-family channels.
 */
function lchToLab([lightness, chroma, hue]: ColorChannels): ColorChannels {
  const radians = (hue * Math.PI) / 180
  return [lightness, chroma * Math.cos(radians), chroma * Math.sin(radians)]
}

/**
 * Convert Cartesian Lab-family channels to lightness, chroma, and hue.
 */
function labToLch([lightness, a, b]: ColorChannels): ColorChannels {
  return [
    lightness,
    Math.hypot(a, b),
    normalizeHue((Math.atan2(b, a) * 180) / Math.PI),
  ]
}

/**
 * Convert Oklab channels to linear sRGB without gamut clipping.
 */
function oklabToLinearSrgb([lightness, a, b]: ColorChannels): ColorChannels {
  const lPrime = lightness + 0.3963377774 * a + 0.2158037573 * b
  const mPrime = lightness - 0.1055613458 * a - 0.0638541728 * b
  const sPrime = lightness - 0.0894841775 * a - 1.291485548 * b
  const l = lPrime ** 3
  const m = mPrime ** 3
  const s = sPrime ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

/**
 * Convert linear sRGB channels to Oklab.
 */
function linearSrgbToOklab([red, green, blue]: ColorChannels): ColorChannels {
  const l = Math.cbrt(
    0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue,
  )
  const m = Math.cbrt(
    0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue,
  )
  const s = Math.cbrt(
    0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue,
  )
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

/**
 * Convert HSL channels to normalized sRGB with bounded saturation and
 * lightness.
 */
function hslToSrgb([hue, saturation, lightness]: ColorChannels): ColorChannels {
  const h = normalizeHue(hue) / 360
  const s = clamp(saturation, 0, 1)
  const l = clamp(lightness, 0, 1)
  if (s === 0) {
    return [l, l, l]
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return [h + 1 / 3, h, h - 1 / 3].map(value =>
    cleanFloatingNoise(hueToRgb(p, q, value)),
  ) as ColorChannels
}

/**
 * Convert normalized sRGB channels to HSL with hue expressed in degrees.
 */
function srgbToHsl([red, green, blue]: ColorChannels): ColorChannels {
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const lightness = (max + min) / 2
  if (max === min) {
    return [0, 0, lightness]
  }

  const difference = max - min
  const saturation =
    lightness > 0.5 ? difference / (2 - max - min) : difference / (max + min)
  let hue: number
  if (max === red) {
    hue = (green - blue) / difference + (green < blue ? 6 : 0)
  } else if (max === green) {
    hue = (blue - red) / difference + 2
  } else {
    hue = (red - green) / difference + 4
  }
  return [hue * 60, saturation, lightness]
}

/**
 * Convert HWB channels to sRGB, normalizing excessive whiteness and blackness.
 */
function hwbToSrgb([hue, whiteness, blackness]: ColorChannels): ColorChannels {
  const white = clamp(whiteness, 0, 1)
  const black = clamp(blackness, 0, 1)
  if (white + black >= 1) {
    const gray = white / (white + black)
    return [gray, gray, gray]
  }

  const pure = hslToSrgb([hue, 1, 0.5])
  const scale = 1 - white - black
  return pure.map(channel =>
    cleanFloatingNoise(channel * scale + white),
  ) as ColorChannels
}

/**
 * Derive hue, whiteness, and blackness from normalized sRGB channels.
 */
function srgbToHwb(channels: ColorChannels): ColorChannels {
  const [hue] = srgbToHsl(channels)
  return [hue, Math.min(...channels), 1 - Math.max(...channels)]
}

/**
 * Apply a three-by-three color conversion matrix to a channel vector.
 */
function multiplyMatrixAndVector(
  matrix: Matrix3x3,
  vector: ColorChannels,
): ColorChannels {
  return [
    matrix[0][0] * vector[0] +
      matrix[0][1] * vector[1] +
      matrix[0][2] * vector[2],
    matrix[1][0] * vector[0] +
      matrix[1][1] * vector[1] +
      matrix[1][2] * vector[2],
    matrix[2][0] * vector[0] +
      matrix[2][1] * vector[1] +
      matrix[2][2] * vector[2],
  ]
}

/**
 * Decode an sRGB channel to linear light while preserving its sign.
 */
function srgbToLinear(value: number): number {
  const sign = Math.sign(value)
  const absolute = Math.abs(value)
  return (
    sign *
    (absolute <= 0.04045
      ? absolute / 12.92
      : ((absolute + 0.055) / 1.055) ** 2.4)
  )
}

/**
 * Encode a linear-light channel with the sRGB transfer function.
 */
function linearToSrgb(value: number): number {
  const sign = Math.sign(value)
  const absolute = Math.abs(value)
  return (
    sign *
    (absolute <= 0.0031308
      ? absolute * 12.92
      : 1.055 * absolute ** (1 / 2.4) - 0.055)
  )
}

/**
 * Decode an A98 RGB channel to linear light while preserving its sign.
 */
function a98RgbToLinear(value: number): number {
  return Math.sign(value) * Math.abs(value) ** 2.19921875
}

/**
 * Encode a linear-light channel with the A98 RGB transfer function.
 */
function linearToA98Rgb(value: number): number {
  return Math.sign(value) * Math.abs(value) ** (1 / 2.19921875)
}

/**
 * Decode a ProPhoto RGB channel to linear light while preserving its sign.
 */
function prophotoToLinear(value: number): number {
  const sign = Math.sign(value)
  const absolute = Math.abs(value)
  return sign * (absolute <= 16 / 512 ? absolute / 16 : absolute ** 1.8)
}

/**
 * Encode a linear-light channel with the ProPhoto RGB transfer function.
 */
function linearToProphoto(value: number): number {
  const sign = Math.sign(value)
  const absolute = Math.abs(value)
  return sign * (absolute <= 1 / 512 ? absolute * 16 : absolute ** (1 / 1.8))
}

/**
 * Decode a Rec. 2020 channel to linear light while preserving its sign.
 */
function rec2020ToLinear(value: number): number {
  const alpha = 1.09929682680944
  const beta = 0.018053968510807
  const sign = Math.sign(value)
  const absolute = Math.abs(value)
  return (
    sign *
    (absolute < beta * 4.5
      ? absolute / 4.5
      : ((absolute + alpha - 1) / alpha) ** (1 / 0.45))
  )
}

/**
 * Encode a linear-light channel with the Rec. 2020 transfer function.
 */
function linearToRec2020(value: number): number {
  const alpha = 1.09929682680944
  const beta = 0.018053968510807
  const sign = Math.sign(value)
  const absolute = Math.abs(value)
  return (
    sign *
    (absolute < beta ? absolute * 4.5 : alpha * absolute ** 0.45 - (alpha - 1))
  )
}

/**
 * Apply the piecewise XYZ-to-Lab coordinate transform.
 */
function labF(value: number): number {
  const delta = 6 / 29
  return value > delta ** 3
    ? Math.cbrt(value)
    : value / (3 * delta ** 2) + 4 / 29
}

/**
 * Apply the inverse Lab-to-XYZ coordinate transform.
 */
function labFInv(value: number): number {
  const delta = 6 / 29
  return value > delta ? value ** 3 : 3 * delta ** 2 * (value - 4 / 29)
}

/**
 * Compute an HSL-derived RGB channel from a wrapped hue fraction.
 */
function hueToRgb(p: number, q: number, rawHue: number): number {
  const hue = ((rawHue % 1) + 1) % 1
  if (hue < 1 / 6) {
    return p + (q - p) * 6 * hue
  }
  if (hue < 1 / 2) {
    return q
  }
  if (hue < 2 / 3) {
    return p + (q - p) * (2 / 3 - hue) * 6
  }
  return p
}

/**
 * Constrain a number to the inclusive minimum and maximum bounds.
 */
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

/**
 * Round conversion noise to twelve decimal places.
 */
function cleanFloatingNoise(value: number): number {
  return Number(value.toFixed(12))
}

// Static Compose colors, including named arguments and float overloads.
val packed = Color(0x80FF0000UL)
val opaque = Color(255, 0, 0)
val translucent = Color(red = 1f, green = 0f, blue = 0f, alpha = .5f)
val hue = Color.hsl(120f, 1f, .5f)
val brightness = Color.hsv(240f, 1f, 1f, .5f)
val framework = android.graphics.Color.argb(128, 255, 0, 0)
val parsed = android.graphics.Color.parseColor("#80336699")

// Explicit static RGB spaces; the preview converts to sRGB.
val srgb = Color(.5f, .5f, .5f, colorSpace = ColorSpaces.Srgb)
val linear = Color(.5f, .5f, .5f, 1f, ColorSpaces.LinearSrgb)
val p3 = Color(.5f, .2f, .1f, colorSpace = ColorSpaces.DisplayP3)
val linearHue = Color.hsl(0f, 0f, .5f, colorSpace = ColorSpaces.LinearSrgb)
val p3Brightness = Color.hsv(
    colorSpace = androidx.compose.ui.graphics.colorspace.ColorSpaces.DisplayP3,
    hue = 210F, saturation = .5F, value = .6F,
)

// Dynamic arguments and unsupported color spaces are intentionally skipped.
val dynamic = Color(red = channel, green = 0f, blue = 0f)
val custom = Color(1f, 0f, 0f, colorSpace = customSpace)
val hdr = Color(1f, 0f, 0f, colorSpace = ColorSpaces.Bt2020Pq)

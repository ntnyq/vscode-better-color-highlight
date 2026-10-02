// Static Compose colors, including named arguments and float overloads.
val packed = Color(0x80FF0000UL)
val opaque = Color(255, 0, 0)
val translucent = Color(red = 1f, green = 0f, blue = 0f, alpha = .5f)
val hue = Color.hsl(120f, 1f, .5f)
val brightness = Color.hsv(240f, 1f, 1f, .5f)
val framework = android.graphics.Color.argb(128, 255, 0, 0)
val parsed = android.graphics.Color.parseColor("#80336699")

// Dynamic arguments and unsupported color spaces are intentionally skipped.
val dynamic = Color(red = channel, green = 0f, blue = 0f)
val custom = Color(1f, 0f, 0f, colorSpace = ColorSpaces.DisplayP3)

class AppColors {
  // Flutter Color constructor uses ARGB channel order.
  static const primary = Color(0xffB11016);
  static const accent = Color(0xff39C5BB);
  static const translucentSurface = Color(0x8039C5BB);
  static const uppercaseHex = Color(0XFF50D71E,);

  // Explicit channel syntax.
  static final surface = Color.fromARGB(255, 226, 226, 226);
  static final overlay = Color.fromARGB(128, 57, 197, 187);
  static final scrim = Color.fromRGBO(57, 197, 187, 0.5);
  static final separatedChannels = Color.fromARGB(1_28, 5_7, 1_97, 1_87,);
  static final exponentOpacity = Color.fromRGBO(57, 197, 187, 5e-1,);
  static final normalized = Color.from(
    alpha: 0.75,
    red: 0.224,
    green: 0.773,
    blue: 0.733,
    colorSpace: ColorSpace.sRGB,
  );
  static final implicitSrgb = Color.from(
    blue: .5,
    alpha: 25e-2,
    red: 1,
    green: 0,
  );
  // NOTE: out-of-range ARGB channels should not be highlighted.
  static final invalidOverlay = Color.fromARGB(256, 57, 197, 187);

  // Direct Flutter Material constants are highlighted as read-only colors.
  static const primaryMaterial = Colors.deepPurple;
  static const accentMaterial = Colors.lightBlueAccent;
  static const translucentMaterial = Colors.black54;
  static const transparentMaterial = Colors.transparent;
  // NOTE: shades and non-sRGB colors are intentionally not highlighted.
  static const primaryShade = Colors.deepPurple.shade700;
  static final displayP3 = Color.from(
    alpha: 1,
    red: 0.224,
    green: 0.773,
    blue: 0.733,
    colorSpace: ColorSpace.displayP3,
  );

  // Regular comments and CSS-like strings are still scanned in Dart files.
  // Design note: fallback #efca19 and rgb(57, 197, 187)
  static const cssPreview = 'rgb(57, 197, 187)';
}

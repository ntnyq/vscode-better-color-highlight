class AppColors {
  // Flutter Color constructor uses ARGB channel order.
  static const primary = Color(0xffB11016);
  static const accent = Color(0xff39C5BB);
  static const translucentSurface = Color(0x8039C5BB);

  // Explicit channel syntax.
  static final surface = Color.fromARGB(255, 226, 226, 226);
  static final overlay = Color.fromARGB(128, 57, 197, 187);

  // Regular comments and CSS-like strings are still scanned in Dart files.
  // Design note: fallback #efca19 and rgb(57, 197, 187)
  static const cssPreview = 'rgb(57, 197, 187)';
}

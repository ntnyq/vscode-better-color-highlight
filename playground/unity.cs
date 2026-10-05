using UnityEngine;
using DrawingColor = System.Drawing.Color;

// Static normalized floats and byte channels with explicit Unity qualification.
var opaque = new UnityEngine.Color(1f, .5f, 0);
var translucent = new UnityEngine.Color(.2F, .4F, .6F, .5F);
var bytes = new UnityEngine.Color32(255, 128, 0, 192);
var named = new UnityEngine.Color(b: 1f, r: .25f, g: 0f, a: .75f);
var global = new global::UnityEngine.Color32(r: 32, g: 64, b: 128, a: 255);
var scientific = new UnityEngine.Color(1e-1f, 2e-1F, 3e-1f);
var commented = new UnityEngine.Color(
    r: 1f /* keep warm channel */,
    g: .5f,
    b: 0f,
    a: .75f // keep opacity note
);

// Bare names remain ambiguous even with the using directive above.
var bare = new Color(1f, 0f, 0f);
var bareBytes = new Color32(255, 0, 0, 255);
var drawing = new System.Drawing.Color();
var aliased = new DrawingColor();
UnityEngine.Color targetTyped = new(1f, 0f, 0f);

// Runtime values, arithmetic, casts, HDR, and named colors are not resolved.
var dynamic = new UnityEngine.Color(channel, 0f, 0f);
var arithmetic = new UnityEngine.Color(128f / 255f, 0f, 0f);
var cast = new UnityEngine.Color((float)0.5, 0f, 0f);
var hdr = new UnityEngine.Color(2f, 0f, 0f);
var preset = UnityEngine.Color.red;

// Invalid component types, ranges, labels, and incomplete calls are skipped.
var doubleChannels = new UnityEngine.Color(0.5, 0, 0);
var invalidByte = new UnityEngine.Color32(256, 0, 0, 255);
var missingByteAlpha = new UnityEngine.Color32(255, 0, 0);
var invalidLabels = new UnityEngine.Color(red: 1f, green: 0f, blue: 0f);
var incomplete = new UnityEngine.Color(1f, 0f,

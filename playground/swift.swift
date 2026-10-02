import SwiftUI
import UIKit

let opaque = Color(red: 1, green: 0, blue: 0)
let translucent = Color(.sRGB, red: 1, green: 0, blue: 0, opacity: 0.5)
let linear = Color(.sRGBLinear, red: 0.5, green: 0.5, blue: 0.5)
let wide = Color(.displayP3, red: 1, green: 0, blue: 0)
let gray = Color(white: 0.5)
let hue = Color(hue: 0.5, saturation: 1, brightness: 1)
let ui = UIColor(red: 1, green: 0, blue: 0, alpha: 0.5)
let uiGray = UIKit.UIColor(white: 0.5, alpha: 1)

// Asset and semantic colors have no deterministic static preview.
let asset = Color("AccentColor")
let semantic = UIColor.systemBackground

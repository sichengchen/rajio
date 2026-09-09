import SwiftUI

enum RajioStyle {
  static let accent = Color.blue
}

struct ArtworkTile: View {
  let url: String?
  var body: some View {
    GeometryReader { geometry in
      AsyncImage(url: url.flatMap(URL.init(string:))) { image in
        image.resizable().scaledToFill()
      } placeholder: {
        ZStack {
          Color(uiColor: .secondarySystemFill)
          Image(systemName: "waveform").font(
            .system(size: max(18, geometry.size.width * 0.25), weight: .light)
          ).foregroundStyle(.secondary)
        }
      }.frame(width: geometry.size.width, height: geometry.size.height).clipped()
    }.clipShape(RoundedRectangle(cornerRadius: 10)).accessibilityHidden(true)
  }
}

struct Artwork: View {
  let url: String?
  let size: CGFloat
  var body: some View { ArtworkTile(url: url).frame(width: size, height: size) }
}

extension View {
  @ViewBuilder func nativeProminentControl() -> some View {
    if #available(iOS 26.0, *) {
      buttonStyle(.glassProminent).buttonBorderShape(.capsule)
    } else {
      buttonStyle(.borderedProminent).buttonBorderShape(.capsule)
    }
  }

  @ViewBuilder func nativeGlassControl() -> some View {
    if #available(iOS 26.0, *) {
      buttonStyle(.glass)
    } else {
      buttonStyle(.bordered)
    }
  }
}

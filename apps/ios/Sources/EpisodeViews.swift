import RajioCore
import SwiftUI
import WebKit

struct ShowView: View {
  let podcast: Podcast
  @ObservedObject var model: LibraryModel
  @ObservedObject var audio: AudioPlayer
  var body: some View {
    List {
      Section {
        HStack(alignment: .top, spacing: 16) {
          Artwork(url: podcast.imageUrl, size: 88)
          VStack(alignment: .leading, spacing: 8) {
            if let author = podcast.author { Text(author).font(.headline) }
            Text(podcast.description).font(.subheadline).foregroundStyle(.secondary).lineLimit(5)
          }
        }
      }
      Section("Episodes") {
        ForEach(model.episodes.filter { $0.podcastId == podcast.id }, id: \.id) { episode in
          EpisodeRow(episode: episode, model: model, audio: audio)
        }
      }
    }
    .navigationTitle(podcast.title)
    .refreshable {
      do {
        try await model.feeds.fetch(podcast.feedUrl, existing: podcast, force: true)
        await model.reload()
      } catch { model.error = error.localizedDescription }
    }
  }
}

struct EpisodeRow: View {
  let episode: Episode
  @ObservedObject var model: LibraryModel
  @ObservedObject var audio: AudioPlayer
  var body: some View {
    NavigationLink {
      EpisodeDetailView(episode: episode, model: model, audio: audio)
    } label: {
      VStack(alignment: .leading, spacing: 6) {
        Text(episode.title).font(.headline)
        HStack {
          if let published = episode.publishedAt,
            let date = try? Date(published, strategy: .iso8601)
          {
            Text(date, style: .date)
          }
          if let duration = episode.duration {
            Text(
              Duration.seconds(duration).formatted(
                .units(allowed: [.hours, .minutes], width: .abbreviated)))
          }
          if model.favorites.contains(episode.id) {
            Image(systemName: "heart.fill").accessibilityLabel("Favorite")
          }
        }.font(.caption).foregroundStyle(.secondary)
        Text(episode.description).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
      }.padding(.vertical, 4)
    }
    .contextMenu {
      Button("Play", systemImage: "play.fill") { Task { await audio.play(episode) } }
      Button("Play Next", systemImage: "text.line.first.and.arrowtriangle.forward") {
        Task { await model.setCollection("queue", episode: episode, included: true, index: 0) }
      }
      Button(
        model.favorites.contains(episode.id) ? "Remove Favorite" : "Favorite", systemImage: "heart"
      ) {
        Task {
          await model.setCollection(
            "favorites", episode: episode, included: !model.favorites.contains(episode.id), index: 0
          )
        }
      }
    }
  }
}

struct EpisodeDetailView: View {
  let episode: Episode
  @ObservedObject var model: LibraryModel
  @ObservedObject var audio: AudioPlayer
  var body: some View {
    VStack(spacing: 0) {
      VStack(alignment: .leading, spacing: 12) {
        HStack(alignment: .top, spacing: 14) {
          Artwork(url: episode.imageUrl, size: 72)
          Text(episode.title).font(.headline).frame(maxWidth: .infinity, alignment: .leading)
        }
        HStack {
          Button("Play", systemImage: "play.fill") { Task { await audio.play(episode) } }
            .buttonStyle(.borderedProminent)
          Button("Play Next", systemImage: "text.line.first.and.arrowtriangle.forward") {
            Task { await model.setCollection("queue", episode: episode, included: true, index: 0) }
          }.buttonStyle(.bordered)
          Button {
            Task {
              await model.setCollection(
                "favorites", episode: episode, included: !model.favorites.contains(episode.id),
                index: 0)
            }
          } label: {
            Label(
              model.favorites.contains(episode.id)
                ? String(localized: "Remove Favorite") : String(localized: "Favorite"),
              systemImage: model.favorites.contains(episode.id) ? "heart.fill" : "heart")
          }.labelStyle(.iconOnly).padding(8)
        }
      }.padding()
      ShowNotes(html: episode.content ?? episode.description)
    }
    .navigationTitle("Episode").navigationBarTitleDisplayMode(.inline)
  }
}

struct ShowNotes: UIViewRepresentable {
  let html: String
  @Environment(\.colorScheme) private var scheme
  func makeCoordinator() -> Coordinator { Coordinator() }
  func makeUIView(context: Context) -> WKWebView {
    let configuration = WKWebViewConfiguration()
    configuration.defaultWebpagePreferences.allowsContentJavaScript = false
    let view = WKWebView(frame: .zero, configuration: configuration)
    view.navigationDelegate = context.coordinator
    view.isOpaque = false
    view.backgroundColor = .clear
    return view
  }
  func updateUIView(_ view: WKWebView, context: Context) {
    let key = "\(scheme)-\(html)"
    guard context.coordinator.loaded != key else { return }
    context.coordinator.loaded = key
    let css =
      "body{font:-apple-system-body;color:\(scheme == .dark ? "#eee" : "#222");padding:0 16px 24px;overflow-wrap:anywhere}a{color:\(scheme == .dark ? "#76baff" : "#0066cc");text-decoration:underline}img{max-width:100%;height:auto}iframe,object,embed{display:none}"
    view.loadHTMLString(
      "<html><head><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline'\"><style>\(css)</style></head><body>\(html)</body></html>",
      baseURL: nil)
  }
  final class Coordinator: NSObject, WKNavigationDelegate {
    var loaded = ""
    func webView(
      _ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
      decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
      if action.navigationType == .linkActivated {
        if let url = action.request.url,
          ["http", "https", "mailto", "tel"].contains(url.scheme ?? "")
        {
          UIApplication.shared.open(url)
        }
        decisionHandler(.cancel)
      } else {
        decisionHandler(action.request.url?.scheme == "about" ? .allow : .cancel)
      }
    }
  }
}

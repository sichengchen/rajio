import RajioCore
import SwiftUI
import WebKit

struct ShowView: View {
  let podcast: Podcast
  @ObservedObject var model: LibraryModel
  @ObservedObject var audio: AudioPlayer
  @State private var expanded = false
  private var episodes: [Episode] { model.episodes.filter { $0.podcastId == podcast.id } }
  var body: some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 0) {
        VStack(spacing: 16) {
          Artwork(url: podcast.imageUrl, size: 176)
            .shadow(color: .black.opacity(0.14), radius: 16, y: 8).padding(.top, 8)
          VStack(spacing: 6) {
            Text(podcast.title).font(.title3.weight(.semibold)).multilineTextAlignment(.center)
            if let author = podcast.author {
              Text(author).font(.subheadline).foregroundStyle(.secondary)
            }
          }
          if let latest = episodes.first {
            Button {
              Task { await audio.play(latest) }
            } label: {
              Label("Latest Episode", systemImage: "play.fill").font(.headline).padding(
                .horizontal, 16
              ).padding(.vertical, 5)
            }.nativeProminentControl().controlSize(.large)
          }
          Text(podcast.description).font(.subheadline).foregroundStyle(.secondary)
            .lineLimit(expanded ? nil : 3).frame(maxWidth: .infinity, alignment: .leading)
          Button(expanded ? L10n.text("Show Less") : L10n.text("Show More")) { expanded.toggle() }
            .font(.subheadline.weight(.semibold)).frame(maxWidth: .infinity, alignment: .trailing)
        }.padding(24).frame(maxWidth: .infinity).background(
          Color(uiColor: .systemBackground))
        Divider()
        HStack {
          Text("Episodes").font(.headline)
          Spacer()
          Text(L10n.episodeCount(episodes.count)).font(.caption).foregroundStyle(.secondary)
        }.padding(20)
        ForEach(episodes, id: \.id) { episode in
          EpisodeRow(episode: episode, model: model, audio: audio).padding(.horizontal, 20).padding(
            .vertical, 12)
          Divider().padding(.horizontal, 20)
        }
      }.padding(.bottom, 20)
    }.navigationTitle(podcast.title).navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Menu("Show actions", systemImage: "ellipsis") {
            Button("Refresh podcasts", systemImage: "arrow.clockwise") { refresh() }
            if let url = URL(string: podcast.feedUrl) { ShareLink(item: url) }
          }
        }
      }
      .refreshable { await fetch() }
  }
  private func refresh() { Task { await fetch() } }
  private func fetch() async {
    do {
      try await model.feeds.fetch(podcast.feedUrl, existing: podcast, force: true)
      await model.reload()
    } catch { model.error = L10n.error(error) }
  }
}

struct EpisodeRow: View {
  @EnvironmentObject private var downloads: DownloadManager
  let episode: Episode
  @ObservedObject var model: LibraryModel
  @ObservedObject var audio: AudioPlayer
  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      NavigationLink {
        EpisodeDetailView(episode: episode, model: model, audio: audio)
      } label: {
        VStack(alignment: .leading, spacing: 6) {
          EpisodeDate(episode: episode)
          Text(episode.title).font(.body.weight(.medium)).foregroundStyle(.primary).lineLimit(3)
          Text(episode.description).font(.footnote).foregroundStyle(.secondary).lineLimit(2)
        }.frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
      }.buttonStyle(.plain).accessibilityLabel(episode.title)
      HStack {
        Button {
          Task { await audio.play(episode) }
        } label: {
          HStack(spacing: 6) {
            Image(
              systemName: audio.episode?.id == episode.id && audio.isPlaying
                ? "waveform" : "play.fill")
            if let duration = episode.duration {
              Text(
                Duration.seconds(duration).formatted(
                  .units(allowed: [.hours, .minutes], width: .abbreviated)))
            } else {
              Text("Play")
            }
          }.font(.caption.weight(.semibold)).padding(.horizontal, 12).padding(.vertical, 8)
            .background(Color(uiColor: .tertiarySystemFill), in: Capsule())
        }.buttonStyle(.plain).accessibilityLabel(L10n.text("Play") + " " + episode.title)
        Spacer()
        if downloads.records[episode.id]?.status == "downloaded" {
          Image(systemName: "arrow.down.circle.fill").foregroundStyle(.secondary)
            .accessibilityLabel("Downloaded")
        }
        if model.favorites.contains(episode.id) {
          Image(systemName: "heart.fill").foregroundStyle(RajioStyle.accent).accessibilityLabel(
            "Favorite")
        }
        Menu("Episode actions", systemImage: "ellipsis") {
          EpisodeMenu(episode: episode, model: model, audio: audio)
        }
        .labelStyle(.iconOnly).frame(width: 44, height: 44).foregroundStyle(.secondary)
      }
    }.contextMenu { EpisodeMenu(episode: episode, model: model, audio: audio) }
  }
}

struct EpisodeDate: View {
  let episode: Episode
  var body: some View {
    if let published = episode.publishedAt, let date = try? Date(published, strategy: .iso8601) {
      Text(date.formatted(.dateTime.month(.abbreviated).day().year().locale(L10n.locale)))
        .font(.caption.weight(.medium)).foregroundStyle(.secondary)
    }
  }
}

struct EpisodeMenu: View {
  let episode: Episode
  @ObservedObject var model: LibraryModel
  @ObservedObject var audio: AudioPlayer
  @EnvironmentObject private var downloads: DownloadManager
  var body: some View {
    Button("Play Next", systemImage: "text.line.first.and.arrowtriangle.forward") {
      Task { await model.setCollection("queue", episode: episode, included: true, index: 0) }
    }
    Button(
      LocalizedStringKey(model.favorites.contains(episode.id) ? "Remove Favorite" : "Favorite"),
      systemImage: "heart"
    ) {
      Task {
        await model.setCollection(
          "favorites", episode: episode, included: !model.favorites.contains(episode.id), index: 0)
      }
    }
    if downloads.records[episode.id]?.status == "downloaded" {
      Button("Remove Download", systemImage: "trash", role: .destructive) {
        Task { await downloads.remove(episode.id) }
      }
    } else {
      Button("Download", systemImage: "arrow.down.circle") {
        Task { await downloads.download(episode) }
      }
    }
    if let url = URL(string: episode.audioUrl) { ShareLink(item: url) }
  }
}

struct EpisodeDetailView: View {
  @State private var notesHeight: CGFloat = 160
  let episode: Episode
  @ObservedObject var model: LibraryModel
  @ObservedObject var audio: AudioPlayer
  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 20) {
        HStack(spacing: 14) {
          Artwork(url: episode.imageUrl, size: 72)
          if let show = model.podcasts.first(where: { $0.id == episode.podcastId }) {
            NavigationLink {
              ShowView(podcast: show, model: model, audio: audio)
            } label: {
              Text(show.title).font(.subheadline.weight(.medium)).foregroundStyle(RajioStyle.accent)
            }
          }
          Spacer()
        }
        VStack(alignment: .leading, spacing: 10) {
          EpisodeDate(episode: episode)
          Text(episode.title).font(.title3.weight(.semibold))
        }
        Button {
          Task { await audio.play(episode) }
        } label: {
          Label("Play", systemImage: "play.fill").font(.headline).frame(maxWidth: .infinity)
            .padding(.vertical, 7)
        }.nativeProminentControl().controlSize(.large)
        DownloadControl(episode: episode)
        Divider()
        Text("Episode Notes").font(.headline)
        ShowNotes(html: episode.content ?? episode.description, height: $notesHeight).frame(
          height: notesHeight)
      }.padding(24)
    }.navigationTitle("Episode").navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Menu("Episode actions", systemImage: "ellipsis") {
            EpisodeMenu(episode: episode, model: model, audio: audio)
          }
        }
      }
  }
}

struct ShowNotes: UIViewRepresentable {
  let html: String
  var height: Binding<CGFloat>?
  @Environment(\.colorScheme) private var scheme
  func makeCoordinator() -> Coordinator { Coordinator(height: height) }
  func makeUIView(context: Context) -> WKWebView {
    let configuration = WKWebViewConfiguration()
    configuration.defaultWebpagePreferences.allowsContentJavaScript = false
    let view = WKWebView(frame: .zero, configuration: configuration)
    view.navigationDelegate = context.coordinator
    view.scrollView.isScrollEnabled = height == nil
    context.coordinator.observe(view)
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
    var height: Binding<CGFloat>?
    var sizeObserver: NSKeyValueObservation?
    init(height: Binding<CGFloat>?) { self.height = height }
    func observe(_ view: WKWebView) {
      guard height != nil else { return }
      sizeObserver = view.scrollView.observe(\.contentSize, options: [.new]) {
        [weak self] scroll, _ in
        let size = max(1, scroll.contentSize.height)
        DispatchQueue.main.async {
          guard let binding = self?.height, abs(binding.wrappedValue - size) > 1 else { return }
          binding.wrappedValue = size
        }
      }
    }
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

struct DownloadControl: View {
  let episode: Episode
  @EnvironmentObject private var downloads: DownloadManager
  var body: some View {
    let record = downloads.records[episode.id]
    VStack(alignment: .leading, spacing: 6) {
      if record?.status == "downloading" {
        HStack {
          ProgressView(value: record?.progress ?? 0).accessibilityLabel("Download progress")
          Button("Cancel") { Task { await downloads.cancel(episode.id) } }
        }
      } else if record?.status == "downloaded" {
        HStack {
          Label("Downloaded", systemImage: "checkmark.circle.fill").foregroundStyle(.secondary)
          Spacer()
          Button("Remove Download", role: .destructive) {
            Task { await downloads.remove(episode.id) }
          }
        }
      } else {
        Button(
          LocalizedStringKey(
            record?.status == "failed" || record?.status == "missing"
              ? "Retry Download" : "Download"),
          systemImage: "arrow.down.circle"
        ) { Task { await downloads.download(episode) } }
      }
      if let error = record?.error { Text(error).font(.caption).foregroundStyle(.secondary) }
    }.frame(maxWidth: .infinity, alignment: .leading)
  }
}

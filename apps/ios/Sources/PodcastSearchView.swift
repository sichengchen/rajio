import SwiftUI

struct PodcastSearchView: View {
  @ObservedObject var model: LibraryModel
  @ObservedObject var audio: AudioPlayer
  @Binding var adding: Bool
  @State private var query = ""
  @State private var source = "catalog"
  @State private var results: [CatalogPodcast] = []
  @State private var searching = false
  @State private var error: String?
  @State private var subscribed: Set<Int> = []
  @State private var task: Task<Void, Never>?
  var body: some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 20) {
        Picker("Search", selection: $source) {
          Text("All Podcasts").tag("catalog")
          Text("Library").tag("library")
        }.pickerStyle(.segmented)
        if query.isEmpty {
          VStack(alignment: .leading, spacing: 12) {
            Text("Find your next favorite.").font(.largeTitle.bold())
            Text("Search shows by title, creator, or topic.").foregroundStyle(.secondary)
          }.padding(.vertical, 24)
          Button {
            adding = true
          } label: {
            Label("Add by RSS URL", systemImage: "link").frame(
              maxWidth: .infinity, alignment: .leading
            ).padding(18)
          }.background(
            Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))
        } else if source == "library" {
          ForEach(
            model.episodes.filter { $0.title.localizedCaseInsensitiveContains(query) }, id: \.id
          ) { episode in
            EpisodeRow(episode: episode, model: model, audio: audio)
            Divider()
          }
        } else {
          if searching { ProgressView("Searching…").frame(maxWidth: .infinity).padding(30) }
          if let error {
            Text(error).foregroundStyle(.secondary)
            Button("Retry") { search() }
          }
          ForEach(results) { podcast in
            HStack(spacing: 14) {
              Artwork(url: podcast.artworkUrl100, size: 76)
              VStack(alignment: .leading, spacing: 5) {
                Text(podcast.collectionName).font(.headline).lineLimit(2)
                Text(podcast.artistName ?? "").font(.subheadline).foregroundStyle(.secondary)
                  .lineLimit(1)
              }.frame(maxWidth: .infinity, alignment: .leading)
              let followed =
                subscribed.contains(podcast.id)
                || model.podcasts.contains { $0.feedUrl == podcast.feedUrl }
              Button {
                guard let url = podcast.feedUrl else { return }
                Task { if await model.subscribe(url) { subscribed.insert(podcast.id) } }
              } label: {
                Image(systemName: followed ? "checkmark" : "plus").font(.headline).frame(
                  width: 44, height: 44)
              }.nativeGlassControl().buttonBorderShape(.circle).disabled(
                followed || model.isLoading || podcast.feedUrl == nil
              )
              .accessibilityLabel(followed ? L10n.text("Following") : L10n.text("Subscribe"))
            }
            Divider().padding(.leading, 90)
          }
          if !searching && results.isEmpty && error == nil {
            Text("No podcasts found.").foregroundStyle(.secondary)
          }
        }
      }.padding(20)
    }.navigationTitle("Search")
      .searchable(text: $query, prompt: "Search podcasts")
      .onSubmit(of: .search, search)
      .onChange(of: query) { _, _ in search() }
      .onChange(of: source) { _, _ in search() }
      .onDisappear { task?.cancel() }
  }
  private func search() {
    task?.cancel()
    guard source == "catalog", !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      results = []
      searching = false
      return
    }
    let term = query
    task = Task {
      searching = true
      error = nil
      do {
        try await Task.sleep(for: .milliseconds(350))
        var url = URLComponents(string: "https://itunes.apple.com/search")!
        url.queryItems = [
          URLQueryItem(name: "term", value: term), URLQueryItem(name: "entity", value: "podcast"),
          URLQueryItem(name: "limit", value: "30"),
        ]
        var request = URLRequest(url: url.url!)
        request.timeoutInterval = 30
        let (data, response) = try await URLSession.shared.data(for: request)
        try Task.checkCancellation()
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
          throw URLError(.badServerResponse)
        }
        struct Response: Decodable { let results: [CatalogPodcast] }
        results = try JSONDecoder().decode(Response.self, from: data).results
      } catch { if !Task.isCancelled { self.error = L10n.error(error) } }
      if !Task.isCancelled { searching = false }
    }
  }
}

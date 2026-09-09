import SwiftUI

struct CatalogPodcast: Decodable, Identifiable {
  let collectionId: Int
  let collectionName: String
  let artistName: String?
  let feedUrl: String?
  let artworkUrl100: String?
  var id: Int { collectionId }
}

struct AddPodcastView: View {
  @ObservedObject var model: LibraryModel
  @Environment(\.dismiss) private var dismiss
  @State private var feedURL = ""
  @State private var query = ""
  @State private var results: [CatalogPodcast] = []
  @State private var searching = false
  @State private var searched = false
  @State private var task: Task<Void, Never>?

  var body: some View {
    NavigationStack {
      List {
        Section("RSS feed") {
          TextField("Feed URL", text: $feedURL).keyboardType(.URL).textInputAutocapitalization(
            .never
          ).autocorrectionDisabled().accessibilityIdentifier("feed-url")
          Button("Add") { subscribe(feedURL) }.disabled(
            model.isLoading || feedURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        Section("Find a podcast") {
          TextField("Search podcasts", text: $query).submitLabel(.search).onSubmit(search)
          Button("Search", action: search).disabled(
            query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
          if searching { ProgressView("Searching…") }
          if searched && results.isEmpty && !searching {
            Text("No podcasts found.").foregroundStyle(.secondary)
          }
          ForEach(results) { podcast in
            Button {
              if let url = podcast.feedUrl { subscribe(url) }
            } label: {
              HStack {
                Artwork(url: podcast.artworkUrl100, size: 48)
                VStack(alignment: .leading) {
                  Text(podcast.collectionName).foregroundStyle(.primary)
                  if let artist = podcast.artistName {
                    Text(artist).font(.caption).foregroundStyle(.secondary)
                  }
                }
              }
            }.disabled(model.isLoading || podcast.feedUrl == nil)
          }
        }
        if model.isLoading { ProgressView("Adding podcast…") }
        if let error = model.error { Text(error).foregroundStyle(.red) }
      }
      .navigationTitle("Add Podcast")
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") {
            task?.cancel()
            dismiss()
          }
        }
      }
      .onDisappear { task?.cancel() }
    }
  }

  private func subscribe(_ url: String) {
    task?.cancel()
    task = Task { if await model.subscribe(url), !Task.isCancelled { dismiss() } }
  }

  private func search() {
    task?.cancel()
    task = Task {
      searching = true
      searched = true
      model.error = nil
      defer { searching = false }
      do {
        var url = URLComponents(string: "https://itunes.apple.com/search")!
        url.queryItems = [
          URLQueryItem(name: "term", value: query), URLQueryItem(name: "entity", value: "podcast"),
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
      } catch { if !Task.isCancelled { model.error = error.localizedDescription } }
    }
  }
}

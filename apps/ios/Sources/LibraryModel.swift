import Combine
import Foundation
import RajioCore
import RajioLibrary

@MainActor
final class LibraryModel: ObservableObject {
  let database: LibraryDatabase
  let feeds: FeedClient
  @Published var podcasts: [Podcast] = []
  @Published var episodes: [Episode] = []
  @Published var favorites: [String] = []
  @Published var queue: [String] = []
  @Published var error: String?
  @Published var isLoading = false
  @Published var isRefreshing = false
  @Published var refreshFailures: [String] = []

  init(database: LibraryDatabase) {
    self.database = database
    feeds = FeedClient(database: database)
  }

  func reload() async {
    do {
      podcasts = try await database.podcasts()
      episodes = try await database.allEpisodes()
      favorites = try await database.collection("favorites")
      queue = try await database.collection("queue")
    } catch { self.error = error.localizedDescription }
  }

  func subscribe(_ input: String) async -> Bool {
    guard !isLoading else { return false }
    isLoading = true
    error = nil
    defer { isLoading = false }
    do {
      try await feeds.fetch(input, force: true)
      await reload()
      return true
    } catch {
      if !Task.isCancelled { self.error = error.localizedDescription }
      return false
    }
  }

  func refresh(force: Bool = false) async {
    guard !isRefreshing else { return }
    isRefreshing = true
    defer { isRefreshing = false }
    refreshFailures = await feeds.refreshAll(force: force)
    await reload()
  }

  func remove(_ podcast: Podcast) async {
    do {
      try await database.unsubscribe(podcastId: podcast.id, at: Date().ISO8601Format())
      await reload()
    } catch { self.error = error.localizedDescription }
  }

  func setCollection(_ name: String, episode: Episode, included: Bool, index: Int? = nil) async {
    do {
      try await database.updateCollection(
        name, episodeId: episode.id, included: included, index: index, at: Date().ISO8601Format())
      await reload()
    } catch { self.error = error.localizedDescription }
  }

  func importOPML(_ data: Data) async {
    guard let xml = String(data: data, encoding: .utf8) else {
      error = String(localized: "Unable to read OPML.")
      return
    }
    do {
      let urls = try RajioCore.library(["kind": "importOpml", "xml": xml], as: [String].self)
      var failures: [String] = []
      for url in urls {
        try Task.checkCancellation()
        do { try await feeds.fetch(url, force: true) } catch {
          failures.append("\(url): \(error.localizedDescription)")
        }
      }
      await reload()
      if !failures.isEmpty { error = failures.joined(separator: "\n") }
    } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
  }

  func exportOPML() -> String {
    func escape(_ value: String) -> String {
      value.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(
        of: "\"", with: "&quot;"
      ).replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: ">", with: "&gt;")
    }
    let outlines = podcasts.map {
      "<outline type=\"rss\" text=\"\(escape($0.title))\" xmlUrl=\"\(escape($0.feedUrl))\"/>"
    }.joined(separator: "\n")
    return
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?><opml version=\"2.0\"><head><title>Rajio</title></head><body>\(outlines)</body></opml>"
  }
}

import Foundation
import RajioCore
import RajioLibrary

actor FeedClient {
  let database: LibraryDatabase
  init(database: LibraryDatabase) { self.database = database }

  @discardableResult
  func fetch(_ input: String, existing: Podcast? = nil, force: Bool = false) async throws -> Bool {
    guard let url = URL(string: input.trimmingCharacters(in: .whitespacesAndNewlines)),
      ["https", "http"].contains(url.scheme?.lowercased() ?? ""), url.host != nil
    else { throw FeedError.invalidURL }
    let previous = try await existing.flatMapAsync { try await database.feedHTTP($0.id) }
    if !force, let previous, previous.nextAttempt > .now { return false }
    do {
      var request = URLRequest(url: url)
      request.timeoutInterval = 30
      request.setValue("Rajio/0.10.1", forHTTPHeaderField: "User-Agent")
      request.setValue(
        "application/rss+xml, application/atom+xml, application/xml, text/xml",
        forHTTPHeaderField: "Accept")
      request.setValue(previous?.etag, forHTTPHeaderField: "If-None-Match")
      request.setValue(previous?.modified, forHTTPHeaderField: "If-Modified-Since")
      let (data, response) = try await URLSession.shared.data(for: request)
      try Task.checkCancellation()
      guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
      let id: String
      if http.statusCode == 304, let existing {
        id = existing.id
      } else {
        guard (200..<300).contains(http.statusCode) else { throw FeedError.http(http.statusCode) }
        guard let xml = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .utf16)
        else { throw URLError(.cannotDecodeContentData) }
        let feed = try await database.ingest(
          feedUrl: url.absoluteString, xml: xml,
          fetchedAt: Date().ISO8601Format(), existingOnly: existing != nil)
        id = feed.podcast.id
      }
      try await database.saveFeedHTTP(
        id,
        state: FeedHTTPState(
          etag: http.value(forHTTPHeaderField: "ETag") ?? previous?.etag,
          modified: http.value(forHTTPHeaderField: "Last-Modified") ?? previous?.modified,
          nextAttempt: Date().addingTimeInterval(3600)))
      return http.statusCode != 304
    } catch {
      if !Task.isCancelled, let existing {
        var state = previous ?? FeedHTTPState()
        state.failures += 1
        state.checkedAt = .now
        state.nextAttempt = Date().addingTimeInterval(
          min(21600, 60 * pow(2, Double(min(state.failures, 9)))))
        try? await database.saveFeedHTTP(existing.id, state: state)
      }
      throw error
    }
  }

  func refreshAll(force: Bool = false) async -> [String] {
    guard let podcasts = try? await database.podcasts() else { return [] }
    // Three concurrent requests keep a large library responsive without flooding feed hosts.
    return await withTaskGroup(of: String?.self) { group in
      var iterator = podcasts.makeIterator()
      func enqueue(_ podcast: Podcast) {
        group.addTask {
          do {
            _ = try await self.fetch(podcast.feedUrl, existing: podcast, force: force)
            return nil
          } catch {
            return Task.isCancelled ? nil : "\(podcast.title): \(L10n.error(error))"
          }
        }
      }
      for _ in 0..<3 { if let podcast = iterator.next() { enqueue(podcast) } }
      var failures: [String] = []
      while let result = await group.next() {
        if let result { failures.append(result) }
        if !Task.isCancelled, let podcast = iterator.next() { enqueue(podcast) }
      }
      return failures
    }
  }
}

extension Optional {
  fileprivate func flatMapAsync<T>(_ transform: (Wrapped) async throws -> T?) async rethrows -> T? {
    guard let value = self else { return nil }
    return try await transform(value)
  }
}

enum FeedError: LocalizedError {
  case invalidURL
  case http(Int)
  var errorDescription: String? {
    switch self {
    case .invalidURL: L10n.text("Enter a valid feed URL.")
    case .http(let code):
      String(
        format: L10n.text("Feed request failed (HTTP %lld)."), locale: L10n.locale, Int64(code))
    }
  }
}

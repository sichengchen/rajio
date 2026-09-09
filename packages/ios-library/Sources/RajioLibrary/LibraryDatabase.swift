import Foundation
import GRDB
import RajioCore

public struct ListeningProgress: Codable, Equatable, Sendable {
  public let episodeId: String
  public let position: Double
  public let duration: Double
  public let updatedAt: String
}

/// Owns local storage. Network access and audio execution belong to the app.
public actor LibraryDatabase {
  private let queue: DatabaseQueue

  public init(path: String) throws {
    queue = try DatabaseQueue(path: path)
    var migrator = DatabaseMigrator()
    migrator.registerMigration("library-v1") { db in
      try db.execute(
        sql: """
          CREATE TABLE podcasts (id TEXT PRIMARY KEY, feed_url TEXT NOT NULL UNIQUE, record BLOB NOT NULL);
          CREATE TABLE episodes (id TEXT PRIMARY KEY, podcast_id TEXT NOT NULL REFERENCES podcasts(id) ON DELETE CASCADE, published_at TEXT, record BLOB NOT NULL);
          CREATE INDEX episodes_by_podcast ON episodes(podcast_id, published_at DESC);
          CREATE TABLE progress (episode_id TEXT PRIMARY KEY REFERENCES episodes(id) ON DELETE CASCADE, record BLOB NOT NULL);
          CREATE TABLE outbox (id TEXT PRIMARY KEY, kind TEXT NOT NULL, payload BLOB NOT NULL, created_at TEXT NOT NULL);
          """)
    }
    migrator.registerMigration("player-selection-v1") { db in
      try db.execute(
        sql:
          "CREATE TABLE player_selection (singleton INTEGER PRIMARY KEY CHECK(singleton=1), episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE)"
      )
    }
    migrator.registerMigration("library-features-v1") { db in
      try db.execute(
        sql: """
          CREATE TABLE preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL);
          CREATE TABLE collections (name TEXT PRIMARY KEY, record BLOB NOT NULL);
          CREATE TABLE downloads (episode_id TEXT PRIMARY KEY REFERENCES episodes(id) ON DELETE CASCADE, record BLOB NOT NULL);
          CREATE TABLE feed_http (podcast_id TEXT PRIMARY KEY REFERENCES podcasts(id) ON DELETE CASCADE, record BLOB NOT NULL);
          """)
    }
    try migrator.migrate(queue)
  }

  @discardableResult
  public func ingest(feedUrl: String, xml: String, fetchedAt: String, existingOnly: Bool = false)
    throws -> ParsedFeed
  {
    let feed = try RajioCore.parseFeed(feedUrl: feedUrl, xml: xml, fetchedAt: fetchedAt)
    try queue.write { db in
      var podcast = feed.podcast
      let existing = try Data.fetchOne(
        db, sql: "SELECT record FROM podcasts WHERE id = ?", arguments: [podcast.id])
      if existingOnly && existing == nil { throw LibraryError.missingEpisode }
      struct SubscriptionPlan: Decodable {
        let subscriptionDate: String
        let isNew: Bool
      }
      var command: [String: Any] = [
        "kind": "subscription", "feedUrl": podcast.feedUrl, "fetchedAt": fetchedAt,
      ]
      if let existing {
        command["existingDate"] = try JSONDecoder().decode(Podcast.self, from: existing)
          .subscriptionDate
      }
      let plan = try RajioCore.library(command, as: SubscriptionPlan.self)
      podcast.subscriptionDate = plan.subscriptionDate
      try db.execute(
        sql:
          "INSERT INTO podcasts VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET feed_url=excluded.feed_url, record=excluded.record",
        arguments: [podcast.id, podcast.feedUrl, try JSONEncoder().encode(podcast)])
      struct Reconciliation: Decodable {
        let episodes: [Episode]
        let aliases: [String: String]
      }
      let stored = try Data.fetchAll(
        db, sql: "SELECT record FROM episodes WHERE podcast_id=? ORDER BY rowid",
        arguments: [podcast.id])
      let records = try stored.map { try JSONSerialization.jsonObject(with: $0) }
      let incoming = try JSONSerialization.jsonObject(with: JSONEncoder().encode(feed.episodes))
      let reconciliation = try RajioCore.library(
        ["kind": "reconcileEpisodes", "incoming": incoming, "existing": records],
        as: Reconciliation.self)
      for episode in reconciliation.episodes {
        try db.execute(
          sql:
            "INSERT INTO episodes VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET published_at=excluded.published_at, record=excluded.record",
          arguments: [
            episode.id, episode.podcastId, episode.publishedAt, try JSONEncoder().encode(episode),
          ])
      }
      for (old, canonical) in reconciliation.aliases {
        let oldProgress = try Data.fetchOne(
          db, sql: "SELECT record FROM progress WHERE episode_id=?", arguments: [old]
        ).map { try JSONDecoder().decode(ListeningProgress.self, from: $0) }
        let currentProgress = try Data.fetchOne(
          db, sql: "SELECT record FROM progress WHERE episode_id=?", arguments: [canonical]
        ).map { try JSONDecoder().decode(ListeningProgress.self, from: $0) }
        if let oldProgress,
          currentProgress == nil || oldProgress.updatedAt > currentProgress!.updatedAt
        {
          let merged = ListeningProgress(
            episodeId: canonical, position: oldProgress.position, duration: oldProgress.duration,
            updatedAt: oldProgress.updatedAt)
          try db.execute(
            sql:
              "INSERT INTO progress VALUES (?, ?) ON CONFLICT(episode_id) DO UPDATE SET record=excluded.record",
            arguments: [canonical, try JSONEncoder().encode(merged)])
        }
        if let data = try Data.fetchOne(
          db, sql: "SELECT record FROM downloads WHERE episode_id=?", arguments: [old])
        {
          var record = try JSONDecoder().decode(DownloadRecord.self, from: data)
          let current = try Data.fetchOne(
            db, sql: "SELECT record FROM downloads WHERE episode_id=?", arguments: [canonical]
          ).map { try JSONDecoder().decode(DownloadRecord.self, from: $0) }
          if current == nil || (record.status == "downloaded" && current?.status != "downloaded") {
            record.episodeId = canonical
            try db.execute(
              sql:
                "INSERT INTO downloads VALUES (?, ?) ON CONFLICT(episode_id) DO UPDATE SET record=excluded.record",
              arguments: [canonical, try JSONEncoder().encode(record)])
          }
        }
        try db.execute(
          sql: "UPDATE player_selection SET episode_id=? WHERE episode_id=?",
          arguments: [canonical, old])
        for name in ["favorites", "queue"] {
          if let data = try Data.fetchOne(
            db, sql: "SELECT record FROM collections WHERE name=?", arguments: [name])
          {
            var seen = Set<String>()
            let ids = try JSONDecoder().decode([String].self, from: data).map {
              $0 == old ? canonical : $0
            }.filter { seen.insert($0).inserted }
            try db.execute(
              sql: "UPDATE collections SET record=? WHERE name=?",
              arguments: [try JSONEncoder().encode(ids), name])
          }
        }
        try db.execute(sql: "DELETE FROM episodes WHERE id=?", arguments: [old])
      }
      if plan.isNew {
        try Self.appendOutbox(
          db, kind: "subscription.upsert", payload: ["feedUrl": podcast.feedUrl], at: fetchedAt)
      }
    }
    return feed
  }

  public func podcasts() throws -> [Podcast] {
    try queue.read { db in
      try Data.fetchAll(db, sql: "SELECT record FROM podcasts ORDER BY rowid DESC")
        .map { try JSONDecoder().decode(Podcast.self, from: $0) }
    }
  }

  public func episodes(podcastId: String) throws -> [Episode] {
    try queue.read { db in
      try Data.fetchAll(
        db, sql: "SELECT record FROM episodes WHERE podcast_id=? ORDER BY published_at DESC, id",
        arguments: [podcastId]
      )
      .map { try JSONDecoder().decode(Episode.self, from: $0) }
    }
  }

  public func unsubscribe(podcastId: String, at: String) throws {
    try queue.write { db in
      guard
        let url = try String.fetchOne(
          db, sql: "SELECT feed_url FROM podcasts WHERE id=?", arguments: [podcastId])
      else { return }
      try db.execute(sql: "DELETE FROM podcasts WHERE id=?", arguments: [podcastId])
      try Self.appendOutbox(db, kind: "subscription.delete", payload: ["feedUrl": url], at: at)
    }
  }

  public func progress(episodeId: String) throws -> ListeningProgress? {
    try queue.read { db in
      try Data.fetchOne(
        db, sql: "SELECT record FROM progress WHERE episode_id=?", arguments: [episodeId]
      )
      .map { try JSONDecoder().decode(ListeningProgress.self, from: $0) }
    }
  }

  public func saveProgress(episodeId: String, position: Double, duration: Double, at: String) throws
  {
    guard position.isFinite, duration.isFinite, position >= 0, duration >= 0 else {
      throw LibraryError.invalidProgress
    }
    let progress = try RajioCore.library(
      [
        "kind": "checkpoint", "episodeId": episodeId,
        "position": position, "duration": duration, "updatedAt": at,
      ], as: ListeningProgress.self)
    try queue.write { db in
      try db.execute(
        sql:
          "INSERT INTO progress VALUES (?, ?) ON CONFLICT(episode_id) DO UPDATE SET record=excluded.record",
        arguments: [episodeId, try JSONEncoder().encode(progress)])
      // Versioned local intent; milestone C translates these into the durable sync protocol.
      try Self.appendOutbox(db, kind: "playback.checkpoint.v1", payload: progress, at: at)
    }
  }

  public func selectEpisode(_ episodeId: String) throws {
    try queue.write { db in
      try db.execute(
        sql:
          "INSERT INTO player_selection VALUES (1, ?) ON CONFLICT(singleton) DO UPDATE SET episode_id=excluded.episode_id",
        arguments: [episodeId])
    }
  }

  public func selectedEpisode() throws -> Episode? {
    try queue.read { db in
      try Data.fetchOne(
        db,
        sql:
          "SELECT record FROM episodes JOIN player_selection ON episodes.id=player_selection.episode_id"
      )
      .map { try JSONDecoder().decode(Episode.self, from: $0) }
    }
  }

  public func pendingOperationCount() throws -> Int {
    try queue.read { try Int.fetchOne($0, sql: "SELECT COUNT(*) FROM outbox") ?? 0 }
  }

  public func allEpisodes() throws -> [Episode] {
    try queue.read { db in
      try Data.fetchAll(db, sql: "SELECT record FROM episodes ORDER BY published_at DESC, id")
        .map { try JSONDecoder().decode(Episode.self, from: $0) }
    }
  }

  public func episode(id: String) throws -> Episode? {
    try queue.read { db in
      try Data.fetchOne(db, sql: "SELECT record FROM episodes WHERE id=?", arguments: [id])
        .map { try JSONDecoder().decode(Episode.self, from: $0) }
    }
  }

  public func collection(_ name: String) throws -> [String] {
    try queue.read { db in
      guard
        let data = try Data.fetchOne(
          db, sql: "SELECT record FROM collections WHERE name=?", arguments: [name])
      else { return [] }
      let ids = try JSONDecoder().decode([String].self, from: data)
      let available = Set(try String.fetchAll(db, sql: "SELECT id FROM episodes"))
      return ids.filter { available.contains($0) }
    }
  }

  public func updateCollection(
    _ name: String, episodeId: String, included: Bool, index: Int? = nil, at: String
  ) throws {
    guard ["favorites", "queue"].contains(name) else { throw LibraryError.invalidCollection }
    try queue.write { db in
      guard
        try String.fetchOne(db, sql: "SELECT id FROM episodes WHERE id=?", arguments: [episodeId])
          != nil
      else { throw LibraryError.missingEpisode }
      let existing = try Data.fetchOne(
        db, sql: "SELECT record FROM collections WHERE name=?", arguments: [name])
      let ids = try existing.map { try JSONDecoder().decode([String].self, from: $0) } ?? []
      var command: [String: Any] = [
        "kind": "collection", "ids": ids, "episodeId": episodeId, "included": included,
      ]
      if let index { command["index"] = index }
      let result = try RajioCore.library(command, as: [String].self)
      try db.execute(
        sql:
          "INSERT INTO collections VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET record=excluded.record",
        arguments: [name, try JSONEncoder().encode(result)])
      try Self.appendOutbox(db, kind: "collection.\(name).v1", payload: result, at: at)
    }
  }

  public func preference(_ key: String) throws -> String? {
    try queue.read {
      try String.fetchOne($0, sql: "SELECT value FROM preferences WHERE key=?", arguments: [key])
    }
  }

  public func setPreference(_ key: String, value: String) throws {
    try queue.write {
      try $0.execute(
        sql:
          "INSERT INTO preferences VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        arguments: [key, value])
    }
  }

  public func downloads() throws -> [DownloadRecord] {
    try queue.read { db in
      try Data.fetchAll(db, sql: "SELECT record FROM downloads").map {
        try JSONDecoder().decode(DownloadRecord.self, from: $0)
      }
    }
  }

  public func saveDownload(_ record: DownloadRecord) throws {
    try queue.write {
      try $0.execute(
        sql:
          "INSERT INTO downloads VALUES (?, ?) ON CONFLICT(episode_id) DO UPDATE SET record=excluded.record",
        arguments: [record.episodeId, try JSONEncoder().encode(record)])
    }
  }

  public func removeDownload(_ episodeId: String) throws {
    try queue.write {
      try $0.execute(sql: "DELETE FROM downloads WHERE episode_id=?", arguments: [episodeId])
    }
  }

  public func feedHTTP(_ podcastId: String) throws -> FeedHTTPState? {
    try queue.read { db in
      try Data.fetchOne(
        db, sql: "SELECT record FROM feed_http WHERE podcast_id=?", arguments: [podcastId]
      ).map { try JSONDecoder().decode(FeedHTTPState.self, from: $0) }
    }
  }

  public func saveFeedHTTP(_ podcastId: String, state: FeedHTTPState) throws {
    try queue.write {
      try $0.execute(
        sql:
          "INSERT INTO feed_http VALUES (?, ?) ON CONFLICT(podcast_id) DO UPDATE SET record=excluded.record",
        arguments: [podcastId, try JSONEncoder().encode(state)])
    }
  }

  private static func appendOutbox<T: Encodable>(
    _ db: Database, kind: String, payload: T, at: String
  ) throws {
    try db.execute(
      sql: "INSERT INTO outbox VALUES (?, ?, ?, ?)",
      arguments: [UUID().uuidString, kind, try JSONEncoder().encode(payload), at])
  }
}

public enum LibraryError: Error { case invalidProgress, invalidCollection, missingEpisode }

public struct DownloadRecord: Codable, Equatable, Sendable {
  public var episodeId: String
  public var status: String
  public var progress: Double
  public var taskToken: String?
  public var fileName: String?
  public var bytes: Int64
  public var error: String?
  public init(
    episodeId: String, status: String, progress: Double = 0, fileName: String? = nil,
    bytes: Int64 = 0, error: String? = nil
  ) {
    self.episodeId = episodeId
    self.status = status
    self.progress = progress
    self.fileName = fileName
    self.bytes = bytes
    self.error = error
  }
}

public struct FeedHTTPState: Codable, Sendable {
  public var etag: String?
  public var modified: String?
  public var checkedAt: Date
  public var failures: Int
  public var nextAttempt: Date
  public init(
    etag: String? = nil, modified: String? = nil, checkedAt: Date = .now, failures: Int = 0,
    nextAttempt: Date = .now
  ) {
    self.etag = etag
    self.modified = modified
    self.checkedAt = checkedAt
    self.failures = failures
    self.nextAttempt = nextAttempt
  }
}

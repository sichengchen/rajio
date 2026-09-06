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
            try db.execute(sql: """
                CREATE TABLE podcasts (id TEXT PRIMARY KEY, feed_url TEXT NOT NULL UNIQUE, record BLOB NOT NULL);
                CREATE TABLE episodes (id TEXT PRIMARY KEY, podcast_id TEXT NOT NULL REFERENCES podcasts(id) ON DELETE CASCADE, published_at TEXT, record BLOB NOT NULL);
                CREATE INDEX episodes_by_podcast ON episodes(podcast_id, published_at DESC);
                CREATE TABLE progress (episode_id TEXT PRIMARY KEY REFERENCES episodes(id) ON DELETE CASCADE, record BLOB NOT NULL);
                CREATE TABLE outbox (id TEXT PRIMARY KEY, kind TEXT NOT NULL, payload BLOB NOT NULL, created_at TEXT NOT NULL);
                """)
        }
        try migrator.migrate(queue)
    }

    @discardableResult
    public func ingest(feedUrl: String, xml: String, fetchedAt: String) throws -> ParsedFeed {
        let feed = try RajioCore.parseFeed(feedUrl: feedUrl, xml: xml, fetchedAt: fetchedAt)
        try queue.write { db in
            var podcast = feed.podcast
            let existing = try Data.fetchOne(db, sql: "SELECT record FROM podcasts WHERE id = ?", arguments: [podcast.id])
            if let existing {
                podcast.subscriptionDate = try JSONDecoder().decode(Podcast.self, from: existing).subscriptionDate
            }
            try db.execute(sql: "INSERT INTO podcasts VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET feed_url=excluded.feed_url, record=excluded.record",
                           arguments: [podcast.id, podcast.feedUrl, try JSONEncoder().encode(podcast)])
            for episode in feed.episodes {
                try db.execute(sql: "INSERT INTO episodes VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET published_at=excluded.published_at, record=excluded.record",
                               arguments: [episode.id, episode.podcastId, episode.publishedAt, try JSONEncoder().encode(episode)])
            }
            if existing == nil {
                try Self.appendOutbox(db, kind: "subscription.upsert", payload: ["feedUrl": podcast.feedUrl], at: fetchedAt)
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
            try Data.fetchAll(db, sql: "SELECT record FROM episodes WHERE podcast_id=? ORDER BY published_at DESC, id", arguments: [podcastId])
                .map { try JSONDecoder().decode(Episode.self, from: $0) }
        }
    }

    public func unsubscribe(podcastId: String, at: String) throws {
        try queue.write { db in
            guard let url = try String.fetchOne(db, sql: "SELECT feed_url FROM podcasts WHERE id=?", arguments: [podcastId]) else { return }
            try db.execute(sql: "DELETE FROM podcasts WHERE id=?", arguments: [podcastId])
            try Self.appendOutbox(db, kind: "subscription.delete", payload: ["feedUrl": url], at: at)
        }
    }

    public func progress(episodeId: String) throws -> ListeningProgress? {
        try queue.read { db in
            try Data.fetchOne(db, sql: "SELECT record FROM progress WHERE episode_id=?", arguments: [episodeId])
                .map { try JSONDecoder().decode(ListeningProgress.self, from: $0) }
        }
    }

    public func saveProgress(episodeId: String, position: Double, duration: Double, at: String) throws {
        guard position.isFinite, duration.isFinite, position >= 0, duration >= 0 else {
            throw LibraryError.invalidProgress
        }
        let progress = ListeningProgress(episodeId: episodeId, position: position, duration: duration, updatedAt: at)
        try queue.write { db in
            try db.execute(sql: "INSERT INTO progress VALUES (?, ?) ON CONFLICT(episode_id) DO UPDATE SET record=excluded.record",
                           arguments: [episodeId, try JSONEncoder().encode(progress)])
            // Versioned local intent; milestone C translates these into the durable sync protocol.
            try Self.appendOutbox(db, kind: "playback.checkpoint.v1", payload: progress, at: at)
        }
    }

    public func pendingOperationCount() throws -> Int {
        try queue.read { try Int.fetchOne($0, sql: "SELECT COUNT(*) FROM outbox") ?? 0 }
    }

    private static func appendOutbox<T: Encodable>(_ db: Database, kind: String, payload: T, at: String) throws {
        try db.execute(sql: "INSERT INTO outbox VALUES (?, ?, ?, ?)",
                       arguments: [UUID().uuidString, kind, try JSONEncoder().encode(payload), at])
    }
}

public enum LibraryError: Error { case invalidProgress }

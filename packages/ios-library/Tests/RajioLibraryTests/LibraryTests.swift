import Foundation
import GRDB
import RajioCore
import RajioLibrary
import XCTest

final class LibraryTests: XCTestCase {
    struct Fixture: Decodable {
        struct Request: Decodable { let feedUrl: String; let xml: String; let fetchedAt: String }
        let request: Request
        let expected: ParsedFeed
    }
    func fixtures() throws -> [Fixture] {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("../../../../crates/rajio-core/tests/fixtures").standardizedFileURL
        return try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "json" }
            .map { try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: $0)) }
    }
    func temporaryPath() -> String { FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString).path }

    func testSharedFixturesSurviveDatabaseReopen() async throws {
        for fixture in try fixtures() {
            let path = temporaryPath()
            defer { try? FileManager.default.removeItem(atPath: path) }
            let db = try LibraryDatabase(path: path)
            try await db.ingest(feedUrl: fixture.request.feedUrl, xml: fixture.request.xml, fetchedAt: fixture.request.fetchedAt)
            let reopened = try LibraryDatabase(path: path)
            let podcasts = try await reopened.podcasts()
            let episodes = try await reopened.episodes(podcastId: fixture.expected.podcast.id)
            let count = try await reopened.pendingOperationCount()
            XCTAssertEqual(podcasts, [fixture.expected.podcast])
            XCTAssertEqual(episodes.sorted { $0.id < $1.id }, fixture.expected.episodes.sorted { $0.id < $1.id })
            XCTAssertEqual(count, 1)
        }
    }

    func testRefreshPreservesSubscriptionAndProgress() async throws {
        let fixture = try XCTUnwrap(fixtures().first { !$0.expected.episodes.isEmpty })
        let path = temporaryPath()
        defer { try? FileManager.default.removeItem(atPath: path) }
        let db = try LibraryDatabase(path: path)
        try await db.ingest(feedUrl: fixture.request.feedUrl, xml: fixture.request.xml, fetchedAt: fixture.request.fetchedAt)
        let id = fixture.expected.episodes[0].id
        try await db.saveProgress(episodeId: id, position: 42, duration: 100, at: fixture.request.fetchedAt)
        try await db.ingest(feedUrl: fixture.request.feedUrl, xml: fixture.request.xml, fetchedAt: "2026-09-06T00:00:00Z")
        let reopened = try LibraryDatabase(path: path)
        let progress = try await reopened.progress(episodeId: id)
        let podcasts = try await reopened.podcasts()
        let count = try await reopened.pendingOperationCount()
        XCTAssertEqual(progress?.position, 42)
        XCTAssertEqual(podcasts[0].subscriptionDate, fixture.expected.podcast.subscriptionDate)
        XCTAssertEqual(count, 2)
        try await reopened.unsubscribe(podcastId: fixture.expected.podcast.id, at: fixture.request.fetchedAt)
        let remaining = try await reopened.episodes(podcastId: fixture.expected.podcast.id)
        let removedProgress = try await reopened.progress(episodeId: id)
        XCTAssertTrue(remaining.isEmpty)
        XCTAssertNil(removedProgress)
    }

    func testOutboxFailureRollsBackLibraryMutation() async throws {
        let fixture = try XCTUnwrap(fixtures().first)
        let path = temporaryPath()
        defer { try? FileManager.default.removeItem(atPath: path) }
        let db = try LibraryDatabase(path: path)
        let injection = try DatabaseQueue(path: path)
        try await injection.write { db in
            try db.execute(sql: "CREATE TRIGGER fail_outbox BEFORE INSERT ON outbox BEGIN SELECT RAISE(ABORT, 'injected failure'); END")
        }
        do {
            try await db.ingest(feedUrl: fixture.request.feedUrl, xml: fixture.request.xml, fetchedAt: fixture.request.fetchedAt)
            XCTFail("Expected the injected transaction failure")
        } catch { }
        let podcasts = try await db.podcasts()
        let count = try await db.pendingOperationCount()
        XCTAssertTrue(podcasts.isEmpty)
        XCTAssertEqual(count, 0)
    }
    func testOutboxFailureRollsBackProgress() async throws {
        let fixture = try XCTUnwrap(fixtures().first { !$0.expected.episodes.isEmpty })
        let path = temporaryPath()
        defer { try? FileManager.default.removeItem(atPath: path) }
        let db = try LibraryDatabase(path: path)
        try await db.ingest(feedUrl: fixture.request.feedUrl, xml: fixture.request.xml, fetchedAt: fixture.request.fetchedAt)
        let id = fixture.expected.episodes[0].id
        try await db.saveProgress(episodeId: id, position: 10, duration: 100, at: fixture.request.fetchedAt)
        let injection = try DatabaseQueue(path: path)
        try await injection.write { db in
            try db.execute(sql: "CREATE TRIGGER fail_outbox BEFORE INSERT ON outbox BEGIN SELECT RAISE(ABORT, 'injected failure'); END")
        }
        do {
            try await db.saveProgress(episodeId: id, position: 80, duration: 100, at: fixture.request.fetchedAt)
            XCTFail("Expected the injected transaction failure")
        } catch { }
        let progress = try await db.progress(episodeId: id)
        let count = try await db.pendingOperationCount()
        XCTAssertEqual(progress?.position, 10)
        XCTAssertEqual(count, 2)
    }

}

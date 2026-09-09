import XCTest
import RajioLibrary
@testable import Rajio

@MainActor
final class DownloadRecoveryTests: XCTestCase {
  func fixture() async throws -> (LibraryDatabase, DownloadManager, URL) {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    let db = try LibraryDatabase(path: root.appendingPathComponent("library.sqlite").path)
    addTeardownBlock {
      try await db.close()
      try FileManager.default.removeItem(at: root)
    }
    let xml = "<rss><channel><title>Recovery</title>" + ["missing", "interrupted", "saved", "cancelled"].map {
      "<item><title>\($0)</title><guid>\($0)</guid><enclosure url=\"https://example.com/\($0).mp3\" type=\"audio/mpeg\"/></item>"
    }.joined() + "</channel></rss>"
    try await db.ingest(feedUrl: "https://example.com/feed.xml", xml: xml, fetchedAt: "2026-09-08T00:00:00Z")
    let manager = DownloadManager(database: db, folder: root.appendingPathComponent("Downloads"),
      sessionIdentifier: "com.scchan.rajio.recovery." + UUID().uuidString)
    return (db, manager, root)
  }

  func testMissingAndInterruptedDownloadsRecoverAfterRestart() async throws {
    let (db, manager, _) = try await fixture()
    let ids = Dictionary(uniqueKeysWithValues: try await db.allEpisodes().map { ($0.title, $0.id) })
    try await db.saveDownload(DownloadRecord(episodeId: ids["missing"]!, status: "downloaded",
      progress: 1, fileName: "gone.mp3", bytes: 200))
    var interrupted = DownloadRecord(episodeId: ids["interrupted"]!, status: "downloading")
    interrupted.taskToken = "interrupted|old-process"
    try await db.saveDownload(interrupted)
    await manager.restore()
    XCTAssertEqual(manager.records[ids["missing"]!]?.status, "missing")
    XCTAssertEqual(manager.records[ids["missing"]!]?.bytes, 0)
    XCTAssertNil(manager.records[ids["missing"]!]?.fileName)
    XCTAssertEqual(manager.records[ids["interrupted"]!]?.status, "failed")
    let persisted = try await db.downloads()
    XCTAssertEqual(persisted.first(where: { $0.episodeId == ids["missing"]! })?.status, "missing")
    XCTAssertEqual(persisted.first(where: { $0.episodeId == ids["interrupted"]! })?.status, "failed")
  }

  func testRemovingDownloadDeletesItsFileAndRecord() async throws {
    let (db, manager, _) = try await fixture()
    try FileManager.default.createDirectory(at: manager.folder, withIntermediateDirectories: true)
    let file = manager.folder.appendingPathComponent("saved.mp3")
    try Data([1, 2, 3]).write(to: file)
    let episodes = try await db.allEpisodes()
    let id = try XCTUnwrap(episodes.first { $0.title == "saved" }?.id)
    try await db.saveDownload(DownloadRecord(episodeId: id, status: "downloaded",
      progress: 1, fileName: "saved.mp3", bytes: 3))
    await manager.restore()
    XCTAssertEqual(manager.records[id]?.status, "downloaded")
    await manager.remove(id)
    XCTAssertFalse(FileManager.default.fileExists(atPath: file.path))
    XCTAssertNil(manager.records[id])
    let saved = try await db.downloads()
    XCTAssertTrue(saved.isEmpty)
  }

  func testCancellationPersistsAcrossManagerRestart() async throws {
    let (db, manager, _) = try await fixture()
    await manager.restore()
    let episodes = try await db.allEpisodes()
    let id = try XCTUnwrap(episodes.first { $0.title == "cancelled" }?.id)
    await manager.cancel(id)
    let restarted = DownloadManager(database: db, folder: manager.folder,
      sessionIdentifier: "com.scchan.rajio.recovery." + UUID().uuidString)
    await restarted.restore()
    XCTAssertEqual(restarted.records[id]?.status, "cancelled")
  }
  func testStorageLimitStopsDownloadBeforeStartingTransfer() async throws {
    let (db, manager, _) = try await fixture()
    try FileManager.default.createDirectory(at: manager.folder, withIntermediateDirectories: true)
    try Data([1, 2, 3]).write(to: manager.folder.appendingPathComponent("saved.mp3"))
    let episodes = try await db.allEpisodes()
    let saved = try XCTUnwrap(episodes.first { $0.title == "saved" })
    let requested = try XCTUnwrap(episodes.first { $0.title == "missing" })
    try await db.saveDownload(DownloadRecord(episodeId: saved.id, status: "downloaded",
      progress: 1, fileName: "saved.mp3", bytes: 3))
    try await db.setPreference("downloadLimitBytes", value: "1")
    await manager.download(requested)
    XCTAssertNil(manager.records[requested.id])
    XCTAssertEqual(manager.error,
      L10n.text("Download storage limit reached. Remove downloads or increase the limit in Settings."))
  }

}

import Foundation
import RajioCore
import XCTest

final class FeedTests: XCTestCase {
    func testDesktopFixturesThroughNativeBindings() throws {
        struct Fixture: Decodable {
            struct Request: Decodable {
                let feedUrl: String
                let xml: String
                let fetchedAt: String
            }
            let request: Request
            let expected: ParsedFeed
        }
        let directory = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("../../../../crates/rajio-core/tests/fixtures").standardizedFileURL
        let files = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "json" }
        XCTAssertFalse(files.isEmpty)
        for file in files {
            let fixture = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: file))
            let result = try RajioCore.parseFeed(
                feedUrl: fixture.request.feedUrl,
                xml: fixture.request.xml,
                fetchedAt: fixture.request.fetchedAt
            )
            XCTAssertEqual(result, fixture.expected, file.lastPathComponent)
        }
    }

    func testErrorPropagation() {
        XCTAssertThrowsError(try RajioCore.parseFeed(feedUrl: "https://example.com/feed", xml: "", fetchedAt: "2026-09-05T00:00:00Z")) {
            XCTAssertEqual($0 as? CoreError, .parsing("RSS feed is empty"))
        }
    }
}

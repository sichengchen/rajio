import XCTest

@MainActor
final class OfflineAcceptanceTests: XCTestCase {
  let app = XCUIApplication()

  override func setUpWithError() throws {
    continueAfterFailure = false
    app.launchEnvironment["RAJIO_TEST_LIBRARY"] = UUID().uuidString
    app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    setSource(online: true)
    app.launch()
  }

  override func tearDownWithError() throws {
    setSource(online: true)
    app.terminate()
  }

  func testDownloadPlaysWithoutSourceAndRestoresProgress() {
    subscribe()
    app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Rajio Offline Acceptance"))
      .firstMatch.tap()
    let episode = app.buttons.matching(
      NSPredicate(format: "label BEGINSWITH %@", "First Offline Episode")
    ).firstMatch
    XCTAssertTrue(episode.waitForExistence(timeout: 10))
    episode.tap()
    let download = app.buttons["Download"]
    XCTAssertTrue(download.waitForExistence(timeout: 5))
    download.tap()
    XCTAssertTrue(app.buttons["Remove Download"].waitForExistence(timeout: 40))
    setSource(online: false)
    app.buttons["Play"].firstMatch.tap()
    let mini = app.buttons["mini-player"]
    XCTAssertTrue(mini.waitForExistence(timeout: 10))
    mini.tap()
    let elapsed = app.staticTexts["elapsed-time"]
    XCTAssertTrue(elapsed.waitForExistence(timeout: 10))
    let advancing = NSPredicate(format: "label != %@", "0:00:00")
    expectation(for: advancing, evaluatedWith: elapsed)
    waitForExpectations(timeout: 20)
    app.buttons["player-toggle"].tap()
    app.buttons["player-forward"].tap()
    let advanced = NSPredicate(format: "label BEGINSWITH %@", "0:00:3")
    expectation(for: advanced, evaluatedWith: elapsed)
    waitForExpectations(timeout: 10)
    let saved = elapsed.label
    app.terminate()
    app.launch()
    XCTAssertTrue(app.buttons["mini-player"].waitForExistence(timeout: 10))
    app.buttons["mini-player"].tap()
    XCTAssertTrue(app.staticTexts["elapsed-time"].waitForExistence(timeout: 10))
    XCTAssertEqual(app.staticTexts["elapsed-time"].label, saved)
    XCTAssertEqual(app.buttons["player-toggle"].label, "Play")
  }

  func testFailedDownloadOffersRetry() {
    subscribe()
    app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Rajio Offline Acceptance"))
      .firstMatch.tap()
    let episode = app.buttons.matching(
      NSPredicate(format: "label BEGINSWITH %@", "Failed Download Episode")
    ).firstMatch
    XCTAssertTrue(episode.waitForExistence(timeout: 10))
    episode.tap()
    XCTAssertTrue(app.buttons["Download"].waitForExistence(timeout: 5))
    app.buttons["Download"].tap()
    XCTAssertTrue(app.buttons["Retry Download"].waitForExistence(timeout: 40))
  }

  private func subscribe() {
    let add = app.buttons["Add Podcast"].firstMatch
    XCTAssertTrue(add.waitForExistence(timeout: 10))
    add.tap()
    let field = app.textFields["feed-url"]
    XCTAssertTrue(field.waitForExistence(timeout: 5))
    field.tap()
    field.typeText("http://127.0.0.1:8767/feed.xml")
    app.buttons["Add"].tap()
    XCTAssertTrue(
      app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Rajio Offline Acceptance"))
        .firstMatch.waitForExistence(timeout: 15))
  }

  private func setSource(online: Bool) {
    let done = expectation(description: "Fixture source state")
    var request = URLRequest(
      url: URL(string: "http://127.0.0.1:8767/\(online ? "online" : "offline")")!)
    request.httpMethod = "POST"
    URLSession.shared.dataTask(with: request) { _, response, error in
      XCTAssertNil(error)
      XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
      done.fulfill()
    }.resume()
    wait(for: [done], timeout: 10)
  }
}

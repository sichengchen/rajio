import XCTest

@MainActor
final class LocalizationAcceptanceTests: XCTestCase {
  func testAllSevenSystemLanguagesRender() {
    let app = XCUIApplication()
    let cases = [
      ("en", "Library", "Add Podcast"),
      ("zh-Hans", "资料库", "添加播客"),
      ("zh-Hant", "資料庫", "加入 Podcast"),
      ("ja", "ライブラリ", "ポッドキャストを追加"),
      ("fr", "Bibliothèque", "Ajouter un podcast"),
      ("es", "Biblioteca", "Añadir pódcast"),
      ("de", "Mediathek", "Podcast hinzufügen"),
    ]
    for (language, title, addLabel) in cases {
      app.launchEnvironment["RAJIO_TEST_LIBRARY"] = UUID().uuidString
      app.launchArguments = [
        "-AppleLanguages", "(" + language + ")", "-AppleLocale", language,
        "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL",
      ]
      app.launch()
      XCTAssertTrue(app.navigationBars[title].waitForExistence(timeout: 10), language)
      XCTAssertTrue(app.buttons[addLabel].firstMatch.isHittable, language)
      let screenshot = XCTAttachment(screenshot: app.screenshot())
      screenshot.name = language + "-large-text"
      screenshot.lifetime = .keepAlways
      add(screenshot)
      app.terminate()
    }
  }

  func testManualLanguageChoiceAppliesImmediatelyAndSurvivesRelaunch() {
    let app = XCUIApplication()
    app.launchEnvironment["RAJIO_TEST_LIBRARY"] = UUID().uuidString
    app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    app.launch()
    XCTAssertTrue(app.buttons["Library actions"].waitForExistence(timeout: 10))
    app.buttons["Library actions"].tap()
    app.buttons["Settings"].tap()
    XCTAssertTrue(app.buttons["language-picker"].waitForExistence(timeout: 5))
    app.buttons["language-picker"].tap()
    app.buttons["Français"].tap()
    XCTAssertTrue(app.navigationBars["Réglages"].waitForExistence(timeout: 5))
    app.buttons["Terminé"].tap()
    XCTAssertTrue(app.navigationBars["Bibliothèque"].waitForExistence(timeout: 5), app.debugDescription)
    app.terminate()
    app.launch()
    XCTAssertTrue(app.navigationBars["Bibliothèque"].waitForExistence(timeout: 10))
    app.terminate()
  }
}

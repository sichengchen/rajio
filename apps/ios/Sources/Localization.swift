import Foundation
import RajioCore

enum L10n {
  static let languages = ["en", "zh-Hans", "zh-Hant", "ja", "fr", "es", "de"]
  static let names = [
    "en": "English", "zh-Hans": "简体中文", "zh-Hant": "繁體中文", "ja": "日本語", "fr": "Français",
    "es": "Español", "de": "Deutsch",
  ]
  static var defaults: UserDefaults {
    #if DEBUG
      if let id = ProcessInfo.processInfo.environment["RAJIO_TEST_LIBRARY"],
        UUID(uuidString: id) != nil
      {
        return UserDefaults(suiteName: "rajio.acceptance." + id)!
      }
    #endif
    return .standard
  }
  static var language: String {
    let chosen = defaults.string(forKey: "appLanguage") ?? "system"
    if languages.contains(chosen) { return chosen }
    return Bundle.preferredLocalizations(from: languages, forPreferences: Locale.preferredLanguages)
      .first ?? "en"
  }
  static var locale: Locale { Locale(identifier: language) }
  static var bundle: Bundle {
    Bundle.main.path(forResource: language, ofType: "lproj").flatMap(Bundle.init(path:)) ?? .main
  }
  static func episodeCount(_ count: Int) -> String {
    String(localized: "\(count) episodes", bundle: bundle, locale: locale)
  }
  static func text(_ key: String) -> String {
    return bundle.localizedString(forKey: key, value: key, table: nil)
  }
  static func error(_ error: Error) -> String {
    if let download = error as? DownloadError {
      return download.errorDescription ?? text("Unable to complete the request. Try again.")
    }
    if let feed = error as? FeedError {
      return feed.errorDescription ?? text("Unable to complete the request. Try again.")
    }
    if error is CoreError { return text("Unable to read this podcast feed.") }
    if let error = error as? URLError {
      switch error.code {
      case .notConnectedToInternet, .cannotConnectToHost, .networkConnectionLost, .cannotFindHost:
        return text("Unable to connect. Check your connection and try again.")
      case .timedOut: return text("The request timed out. Try again.")
      case .cancelled: return text("Cancelled")
      default: return text("Unable to load this content. Try again.")
      }
    }
    return text("Unable to complete the request. Try again.")
  }
}

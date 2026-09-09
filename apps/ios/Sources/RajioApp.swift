import SwiftUI

@main
struct RajioApp: App {
  @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
  @AppStorage("appLanguage", store: L10n.defaults) private var language = "system"
  @AppStorage("appearance", store: L10n.defaults) private var appearance = "system"
  @AppStorage("automaticRefresh", store: L10n.defaults) private var automaticRefresh = true
  var body: some Scene {
    WindowGroup {
      Group {
        switch delegate.database {
        case .success(let database):
          if let downloads = delegate.downloads {
            LibraryView(database: database, downloads: downloads)
          }
        case .failure(let error):
          ContentUnavailableView(
            "Unable to open library", systemImage: "externaldrive.badge.exclamationmark",
            description: Text(L10n.error(error)))
        }
      }
      .environment(\.locale, Locale(identifier: language == "system" ? L10n.language : language))
      .preferredColorScheme(appearance == "system" ? nil : (appearance == "dark" ? .dark : .light))
      .onChange(of: automaticRefresh) { _, _ in delegate.scheduleRefresh() }
    }
  }
}

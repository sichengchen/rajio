import SwiftUI

@main
struct RajioApp: App {
  @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
  var body: some Scene {
    WindowGroup {
      switch delegate.database {
      case .success(let database):
        if let downloads = delegate.downloads {
          LibraryView(database: database, downloads: downloads)
        }
      case .failure(let error):
        ContentUnavailableView(
          "Unable to open library", systemImage: "externaldrive.badge.exclamationmark",
          description: Text(error.localizedDescription))
      }
    }
  }
}

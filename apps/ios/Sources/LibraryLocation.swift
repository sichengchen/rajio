import Foundation

enum LibraryLocation {
  static var directory: URL {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    #if DEBUG
      if let id = ProcessInfo.processInfo.environment["RAJIO_TEST_LIBRARY"],
        UUID(uuidString: id) != nil
      {
        return base.appendingPathComponent("Acceptance", isDirectory: true).appendingPathComponent(
          id, isDirectory: true)
      }
    #endif
    return base
  }
}

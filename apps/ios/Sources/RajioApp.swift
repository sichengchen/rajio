import SwiftUI
import RajioLibrary

@main
struct RajioApp: App {
    private let database: Result<LibraryDatabase, Error>
    init() {
        database = Result {
            let folder = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            return try LibraryDatabase(path: folder.appendingPathComponent("rajio.sqlite").path)
        }
    }
    var body: some Scene {
        WindowGroup {
            switch database {
            case .success(let database): LibraryView(database: database)
            case .failure(let error): ContentUnavailableView("Unable to open library", systemImage: "externaldrive.badge.exclamationmark", description: Text(error.localizedDescription))
            }
        }
    }
}

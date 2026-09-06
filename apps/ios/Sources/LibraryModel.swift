import Combine
import Foundation
import RajioCore
import RajioLibrary

@MainActor
final class LibraryModel: ObservableObject {
    let database: LibraryDatabase
    @Published var podcasts: [Podcast] = []
    @Published var error: String?
    @Published var isLoading = false

    init(database: LibraryDatabase) { self.database = database }

    func reload() async {
        do { podcasts = try await database.podcasts() }
        catch { self.error = error.localizedDescription }
    }

    func subscribe(_ input: String) async -> Bool {
        guard !isLoading else { return false }
        guard let url = URL(string: input.trimmingCharacters(in: .whitespacesAndNewlines)),
              ["https", "http"].contains(url.scheme?.lowercased() ?? ""), url.host != nil else {
            error = String(localized: "Enter a valid feed URL.")
            return false
        }
        isLoading = true
        defer { isLoading = false }
        do {
            var request = URLRequest(url: url)
            request.timeoutInterval = 30
            request.setValue("Rajio/0.10.1", forHTTPHeaderField: "User-Agent")
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                throw URLError(.badServerResponse)
            }
            guard let xml = String(data: data, encoding: .utf8) else { throw URLError(.cannotDecodeContentData) }
            try await database.ingest(feedUrl: url.absoluteString, xml: xml, fetchedAt: Date().ISO8601Format())
            await reload()
            return true
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }

    func remove(_ podcast: Podcast) async {
        do {
            try await database.unsubscribe(podcastId: podcast.id, at: Date().ISO8601Format())
            await reload()
        } catch { self.error = error.localizedDescription }
    }
}

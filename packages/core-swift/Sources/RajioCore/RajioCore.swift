import CRajioCore
import Foundation

public struct Podcast: Codable, Equatable, Sendable {
    public let id: String
    public let feedUrl: String
    public let title: String
    public let author: String?
    public let description: String
    public let imageUrl: String?
    public let language: String?
    public var subscriptionDate: String
    public let lastUpdated: String
}

public struct Episode: Codable, Equatable, Sendable {
    public let id: String
    public let podcastId: String
    public let guid: String?
    public let title: String
    public let description: String
    public let content: String?
    public let audioUrl: String
    public let imageUrl: String?
    public let publishedAt: String?
    public let duration: Double?
}

public struct ParsedFeed: Codable, Equatable, Sendable {
    public let podcast: Podcast
    public let episodes: [Episode]
}

public enum CoreError: Error, Equatable {
    case parsing(String)
    case invalidResponse
}

public enum RajioCore {
    /// Hosts fetch the XML and supply a timestamp. The Rust core performs parsing.
    public static func parseFeed(feedUrl: String, xml: String, fetchedAt: String) throws -> ParsedFeed {
        struct Request: Encodable {
            let feedUrl: String
            let xml: String
            let fetchedAt: String
        }
        struct Response: Decodable {
            let value: ParsedFeed?
            let error: String?
        }
        let request = Request(feedUrl: feedUrl, xml: xml, fetchedAt: fetchedAt)
        let json = String(decoding: try JSONEncoder().encode(request), as: UTF8.self)
        guard let pointer = json.withCString({ rajio_core_parse_feed($0) }) else {
            throw CoreError.invalidResponse
        }
        defer { rajio_core_free(pointer) }
        let response = try JSONDecoder().decode(Response.self, from: Data(String(cString: pointer).utf8))
        if let error = response.error { throw CoreError.parsing(error) }
        guard let value = response.value else { throw CoreError.invalidResponse }
        return value
    }
}

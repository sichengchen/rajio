import Combine
import Foundation
import RajioCore
import RajioLibrary

@MainActor
final class DownloadManager: NSObject, ObservableObject, URLSessionDownloadDelegate {
  @Published private(set) var records: [String: DownloadRecord] = [:]
  @Published var error: String?
  let database: LibraryDatabase
  nonisolated let folder: URL
  nonisolated private let writes = DispatchGroup()
  var backgroundCompletion: (() -> Void)?
  private var ready = false
  private var restoration: Task<Void, Never>?
  private var starting = Set<String>()
  private var reservedBytes: Int64 = 0
  private lazy var session: URLSession = {
    let configuration = URLSessionConfiguration.background(
      withIdentifier: "com.scchan.rajio.downloads"
        + (ProcessInfo.processInfo.environment["RAJIO_TEST_LIBRARY"].map { "." + $0 } ?? ""))
    configuration.sessionSendsLaunchEvents = true
    configuration.isDiscretionary = false
    configuration.httpMaximumConnectionsPerHost = 2
    configuration.timeoutIntervalForResource = 24 * 3600
    return URLSession(configuration: configuration, delegate: self, delegateQueue: .main)
  }()

  init(database: LibraryDatabase) {
    self.database = database
    folder = Self.downloadFolder
    super.init()
  }

  nonisolated static var downloadFolder: URL {
    LibraryLocation.directory.appendingPathComponent("Downloads", isDirectory: true)
  }

  func restore() async {
    if let restoration {
      await restoration.value
      return
    }
    guard !ready else { return }
    let task = Task { await self.reconcile() }
    restoration = task
    await task.value
    restoration = nil
  }

  private func reconcile() async {
    ready = true
    do {
      try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
      var directory = folder
      var values = URLResourceValues()
      values.isExcludedFromBackup = true
      try directory.setResourceValues(values)
      let saved = try await database.downloads()
      records = Dictionary(uniqueKeysWithValues: saved.map { ($0.episodeId, $0) })
      let tasks = await session.allTasks
      let active = Set(tasks.compactMap(\.taskDescription))
      for var record in saved {
        if record.status == "downloaded", localURL(record) == nil {
          record.status = "missing"
          record.fileName = nil
          record.bytes = 0
          record.error = L10n.text("Downloaded file is missing. Download it again.")
          try await store(record)
        } else if record.status == "downloading", !active.contains(record.taskToken ?? "") {
          record.status = "failed"
          record.error = L10n.text("Download interrupted. Try again.")
          try await store(record)
        }
      }
      for task in tasks {
        let id = task.taskDescription?.components(separatedBy: "|").first ?? ""
        if records[id]?.status != "downloading" || records[id]?.taskToken != task.taskDescription {
          task.cancel()
        }
      }
      // Files moved just before a process exit can be recovered by their stable episode name.
      for episode in try await database.allEpisodes() {
        let prefix =
          (records[episode.id]?.taskToken ?? episode.id).replacingOccurrences(of: "|", with: "-")
          + "."
        if records[episode.id]?.status != "downloaded",
          let file = try FileManager.default.contentsOfDirectory(
            at: folder, includingPropertiesForKeys: nil
          ).first(where: { $0.lastPathComponent.hasPrefix(prefix) }),
          let bytes = try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize, bytes > 0
        {
          try await store(
            DownloadRecord(
              episodeId: episode.id, status: "downloaded", progress: 1,
              fileName: file.lastPathComponent, bytes: Int64(bytes)))
        }
      }
      let referenced = Set(records.values.compactMap(\.fileName))
      for file in try FileManager.default.contentsOfDirectory(
        at: folder, includingPropertiesForKeys: nil)
      where !referenced.contains(file.lastPathComponent)
        && file.lastPathComponent.hasPrefix("episode_")
      {
        try? FileManager.default.removeItem(at: file)
      }
    } catch {
      self.error = L10n.error(error)
      ready = false
    }
  }

  func download(_ episode: Episode) async {
    guard starting.insert(episode.id).inserted else { return }
    defer { starting.remove(episode.id) }
    await restore()
    guard records[episode.id]?.status != "downloading", records[episode.id]?.status != "downloaded"
    else { return }
    do {
      guard let url = URL(string: episode.audioUrl), ["http", "https"].contains(url.scheme ?? "")
      else { throw URLError(.badURL) }
      guard try await remainingBudget() > 0 else { throw DownloadError.storageLimit }
      var record = DownloadRecord(episodeId: episode.id, status: "downloading")
      record.taskToken = episode.id + "|" + UUID().uuidString
      try await store(record)
      guard records[episode.id]?.status == "downloading",
        records[episode.id]?.taskToken == record.taskToken
      else { return }
      let task = session.downloadTask(with: url)
      task.taskDescription = record.taskToken
      task.resume()
    } catch { self.error = L10n.error(error) }
  }

  func cancel(_ episodeId: String) async {
    do {
      var record = records[episodeId] ?? DownloadRecord(episodeId: episodeId, status: "cancelled")
      record.status = "cancelled"
      record.progress = 0
      record.error = nil
      try await store(record)
      for task in await session.allTasks
      where task.taskDescription?.components(separatedBy: "|").first == episodeId { task.cancel() }
    } catch { self.error = L10n.error(error) }
  }

  func remove(_ episodeId: String) async {
    await cancel(episodeId)
    do {
      if let record = records[episodeId], let file = record.fileName {
        let url = folder.appendingPathComponent(file)
        if FileManager.default.fileExists(atPath: url.path) {
          try FileManager.default.removeItem(at: url)
        }
      }
      try await database.removeDownload(episodeId)
      records.removeValue(forKey: episodeId)
    } catch { self.error = L10n.error(error) }
  }

  private func localURL(_ record: DownloadRecord) -> URL? {
    guard let file = record.fileName, file == URL(fileURLWithPath: file).lastPathComponent else {
      return nil
    }
    let url = folder.appendingPathComponent(file)
    return FileManager.default.fileExists(atPath: url.path) ? url : nil
  }

  private func store(_ record: DownloadRecord) async throws {
    try await database.saveDownload(record)
    records[record.episodeId] = record
  }

  private func remainingBudget() async throws -> Int64 {
    let limit =
      Int64(try await database.preference("downloadLimitBytes") ?? "2147483648") ?? 2_147_483_648
    return limit - reservedBytes - records.values.reduce(Int64(0)) { $0 + $1.bytes }
  }

  nonisolated func urlSession(
    _ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64,
    totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64
  ) {
    guard let token = downloadTask.taskDescription,
      let id = token.components(separatedBy: "|").first
    else { return }
    Task { @MainActor in
      guard self.records[id]?.status == "downloading", self.records[id]?.taskToken == token else {
        return
      }
      self.records[id]?.progress =
        totalBytesExpectedToWrite > 0
        ? Double(totalBytesWritten) / Double(totalBytesExpectedToWrite) : 0
    }
  }

  nonisolated func urlSession(
    _ session: URLSession, downloadTask: URLSessionDownloadTask,
    didFinishDownloadingTo location: URL
  ) {
    guard let token = downloadTask.taskDescription,
      let id = token.components(separatedBy: "|").first
    else { return }
    // URLSession removes its temporary file when this delegate method returns.
    let sourceExtension = downloadTask.originalRequest?.url?.pathExtension.lowercased() ?? ""
    let formats = ["mp3", "m4a", "mp4", "wav", "aac", "aiff", "aif", "caf", "ogg", "opus"]
    let mimeExtensions = [
      "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/wav": "wav",
      "audio/x-wav": "wav", "audio/aac": "aac",
    ]
    let ext =
      formats.contains(sourceExtension)
      ? sourceExtension : (mimeExtensions[downloadTask.response?.mimeType ?? ""] ?? "mp3")
    let target = folder.appendingPathComponent(
      token.replacingOccurrences(of: "|", with: "-") + "." + ext)
    let result: Result<Int64, Error> = Result {
      guard let response = downloadTask.response as? HTTPURLResponse,
        (200..<300).contains(response.statusCode)
      else { throw URLError(.badServerResponse) }
      let bytes = Int64(try location.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0)
      guard bytes > 0 else { throw URLError(.zeroByteResource) }
      if FileManager.default.fileExists(atPath: target.path) {
        try FileManager.default.removeItem(at: target)
      }
      try FileManager.default.moveItem(at: location, to: target)
      try FileManager.default.setAttributes(
        [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
        ofItemAtPath: target.path)
      return bytes
    }
    writes.enter()
    Task { @MainActor in
      defer { writes.leave() }
      do {
        let bytes = try result.get()
        guard records[id]?.status == "downloading", records[id]?.taskToken == token else {
          try? FileManager.default.removeItem(at: target)
          return
        }
        guard bytes <= (try await remainingBudget()) else { throw DownloadError.storageLimit }
        reservedBytes += bytes
        defer { reservedBytes -= bytes }
        try await store(
          DownloadRecord(
            episodeId: id, status: "downloaded", progress: 1, fileName: target.lastPathComponent,
            bytes: bytes))
      } catch {
        try? FileManager.default.removeItem(at: target)
        if records[id]?.status == "downloading", records[id]?.taskToken == token {
          try? await store(
            DownloadRecord(episodeId: id, status: "failed", error: L10n.error(error)))
        }
      }
    }
  }

  nonisolated func urlSession(
    _ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?
  ) {
    guard let error, let token = task.taskDescription,
      let id = token.components(separatedBy: "|").first
    else { return }
    writes.enter()
    Task { @MainActor in
      defer { writes.leave() }
      if records[id]?.status == "downloading", records[id]?.taskToken == token {
        try? await store(
          DownloadRecord(episodeId: id, status: "failed", error: L10n.error(error)))
      }
    }
  }

  nonisolated func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
    writes.notify(queue: .main) { [weak self] in
      MainActor.assumeIsolated {
        self?.backgroundCompletion?()
        self?.backgroundCompletion = nil
      }
    }
  }
}

enum DownloadError: LocalizedError {
  case storageLimit
  var errorDescription: String? {
    L10n.text("Download storage limit reached. Remove downloads or increase the limit in Settings.")
  }
}

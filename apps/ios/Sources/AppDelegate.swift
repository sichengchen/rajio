import BackgroundTasks
import RajioLibrary
import UIKit

@MainActor
final class AppDelegate: NSObject, UIApplicationDelegate {
  let database: Result<LibraryDatabase, Error> = Result {
    let folder = LibraryLocation.directory
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    return try LibraryDatabase(path: folder.appendingPathComponent("rajio.sqlite").path)
  }
  lazy var downloads: DownloadManager? = {
    guard case .success(let database) = database else { return nil }
    return DownloadManager(database: database)
  }()

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    BGTaskScheduler.shared.register(forTaskWithIdentifier: "com.scchan.rajio.refresh", using: .main)
    { [weak self] task in
      Task { @MainActor in
        guard let self, case .success(let database) = self.database else {
          task.setTaskCompleted(success: false)
          return
        }
        guard L10n.defaults.object(forKey: "automaticRefresh") as? Bool != false else {
          task.setTaskCompleted(success: true)
          return
        }
        self.scheduleRefresh()
        let refresh = Task { await FeedClient(database: database).refreshAll() }
        task.expirationHandler = { refresh.cancel() }
        let failures = await refresh.value
        task.setTaskCompleted(success: failures.isEmpty && !refresh.isCancelled)
      }
    }
    scheduleRefresh()
    return true
  }

  func scheduleRefresh() {
    guard L10n.defaults.object(forKey: "automaticRefresh") as? Bool != false else {
      BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: "com.scchan.rajio.refresh")
      return
    }
    let request = BGAppRefreshTaskRequest(identifier: "com.scchan.rajio.refresh")
    request.earliestBeginDate = Date().addingTimeInterval(3600)
    do { try BGTaskScheduler.shared.submit(request) } catch
    { /* Foreground refresh remains available when system scheduling is disabled. */  }
  }

  func application(
    _ application: UIApplication, handleEventsForBackgroundURLSession identifier: String,
    completionHandler: @escaping () -> Void
  ) {
    guard identifier == "com.scchan.rajio.downloads", let downloads else {
      completionHandler()
      return
    }
    downloads.backgroundCompletion = completionHandler
    Task { await downloads.restore() }
  }
}

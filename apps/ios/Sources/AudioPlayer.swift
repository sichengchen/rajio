import AVFoundation
import Combine
import MediaPlayer
import RajioCore
import RajioLibrary

@MainActor
final class AudioPlayer: ObservableObject {
  @Published private(set) var episode: Episode?
  @Published private(set) var isPlaying = false
  @Published private(set) var position: Double = 0
  @Published private(set) var duration: Double = 0
  @Published private(set) var isLoading = false
  @Published var error: String?
  private let player = AVPlayer()
  private let database: LibraryDatabase
  private var timeObserver: Any?
  private var itemObserver: NSKeyValueObservation?
  private var notifications: [NSObjectProtocol] = []
  private var resumeAfterInterruption = false
  private var requestID = UUID()
  private var wantsPlayback = false
  private var isSeeking = false
  private var restored = false
  private var lastCheckpoint = Date.distantPast
  private var playbackObserver: NSKeyValueObservation?

  init(database: LibraryDatabase) {
    self.database = database
    timeObserver = player.addPeriodicTimeObserver(
      forInterval: CMTime(seconds: 0.5, preferredTimescale: 600), queue: .main
    ) { [weak self] time in
      Task { @MainActor in
        guard let self, !self.isSeeking, self.player.currentItem?.status == .readyToPlay else {
          return
        }
        self.position = max(0, time.seconds.isFinite ? time.seconds : 0)
        let duration = self.player.currentItem?.duration.seconds ?? 0
        self.duration = duration.isFinite ? max(0, duration) : 0
        if self.wantsPlayback && Date().timeIntervalSince(self.lastCheckpoint) >= 5 {
          self.lastCheckpoint = Date()
          await self.checkpoint()
        }
        self.updateNowPlaying()
      }
    }
    playbackObserver = player.observe(\.timeControlStatus, options: [.new]) { [weak self] _, _ in
      Task { @MainActor in
        guard let self else { return }
        self.isLoading =
          self.wantsPlayback
          && (self.player.currentItem?.status != .readyToPlay
            || self.player.timeControlStatus == .waitingToPlayAtSpecifiedRate)
      }
    }
    let center = MPRemoteCommandCenter.shared()
    center.playCommand.addTarget { [weak self] _ in
      Task { @MainActor in self?.resume() }
      return .success
    }
    center.pauseCommand.addTarget { [weak self] _ in
      Task { @MainActor in self?.pause() }
      return .success
    }
    center.skipForwardCommand.preferredIntervals = [30]
    center.skipBackwardCommand.preferredIntervals = [30]
    center.skipForwardCommand.addTarget { [weak self] _ in
      Task { @MainActor in self?.seek(by: 30) }
      return .success
    }
    center.skipBackwardCommand.addTarget { [weak self] _ in
      Task { @MainActor in self?.seek(by: -30) }
      return .success
    }
    notifications.append(
      NotificationCenter.default.addObserver(
        forName: AVAudioSession.interruptionNotification, object: nil, queue: .main
      ) { [weak self] note in
        let type = (note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt) ?? 0
        let options = (note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt) ?? 0
        Task { @MainActor in
          guard let self else { return }
          if type == AVAudioSession.InterruptionType.began.rawValue {
            self.resumeAfterInterruption = self.isPlaying
            self.pause(preserveInterruptionIntent: true)
          } else {
            if self.resumeAfterInterruption
              && AVAudioSession.InterruptionOptions(rawValue: options).contains(.shouldResume)
            {
              self.resume()
            }
            self.resumeAfterInterruption = false
          }
        }
      })
    notifications.append(
      NotificationCenter.default.addObserver(
        forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main
      ) { [weak self] note in
        let reason = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt
        if reason == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue {
          Task { @MainActor in self?.pause() }
        }
      })
    notifications.append(
      NotificationCenter.default.addObserver(
        forName: .AVPlayerItemFailedToPlayToEndTime, object: nil, queue: .main
      ) { [weak self] note in
        let item = note.object as? AVPlayerItem
        Task { @MainActor in
          guard let self, self.player.currentItem === item else { return }
          self.pause()
          self.error = String(localized: "Playback failed. Try again.")
        }
      })
    notifications.append(
      NotificationCenter.default.addObserver(
        forName: .AVPlayerItemDidPlayToEndTime, object: nil, queue: .main
      ) { [weak self] note in
        let item = note.object as? AVPlayerItem
        Task { @MainActor in
          guard let self, self.player.currentItem === item else { return }
          self.pause()
        }
      })
  }

  func restore() async {
    guard !restored else { return }
    restored = true
    do {
      if let selected = try await database.selectedEpisode(), episode == nil {
        let saved = try await database.progress(episodeId: selected.id)
        guard episode == nil else { return }
        episode = selected
        position = saved?.position ?? 0
        duration = saved?.duration ?? selected.duration ?? 0
        updateNowPlaying()
      }
    } catch { self.error = error.localizedDescription }
  }

  func play(_ next: Episode) async {
    if episode?.id == next.id && player.currentItem?.status != .failed {
      resume()
      return
    }
    await prepare(next, autoplay: true)
  }

  private func prepare(_ next: Episode, autoplay: Bool) async {
    // Capture the outgoing item before suspending; late writes must never target the new item.
    pause()
    requestID = UUID()
    let request = requestID
    await checkpoint()
    do {
      let saved = try await database.progress(episodeId: next.id)
      guard requestID == request else { return }
      guard let url = URL(string: next.audioUrl), ["http", "https"].contains(url.scheme ?? "")
      else { throw URLError(.badURL) }
      try await database.selectEpisode(next.id)
      guard requestID == request else { return }
      episode = next
      error = nil
      position = saved?.position ?? 0
      if let saved, saved.duration > 0, saved.position >= saved.duration - 0.5 { position = 0 }
      duration = saved?.duration ?? next.duration ?? 0
      wantsPlayback = autoplay
      isPlaying = autoplay
      isLoading = autoplay
      isSeeking = true
      let startPosition = position
      let item = AVPlayerItem(url: url)
      itemObserver = item.observe(\.status, options: [.new]) { [weak self] item, _ in
        Task { @MainActor in
          guard let self, self.requestID == request, self.player.currentItem === item else {
            return
          }
          switch item.status {
          case .failed:
            self.isSeeking = false
            self.pause()
            self.error = String(localized: "Playback failed. Try again.")
          case .readyToPlay:
            self.itemObserver = nil
            if startPosition > 0 {
              await self.player.seek(to: CMTime(seconds: startPosition, preferredTimescale: 600))
            }
            guard self.requestID == request else { return }
            self.isSeeking = false
            self.isLoading = false
            if self.wantsPlayback { self.resume() }
            self.updateNowPlaying()
          default: break
          }
        }
      }
      player.replaceCurrentItem(with: item)
      updateNowPlaying()
    } catch {
      guard requestID == request else { return }
      isSeeking = false
      isLoading = false
      wantsPlayback = false
      isPlaying = false
      self.error = error.localizedDescription
    }
  }

  func resume() {
    guard let episode else { return }
    if player.currentItem == nil || player.currentItem?.status == .failed {
      Task { await prepare(episode, autoplay: true) }
      return
    }
    wantsPlayback = true
    isPlaying = true
    isLoading = player.currentItem?.status != .readyToPlay || isSeeking
    guard !isLoading else { return }
    do {
      try AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
      try AVAudioSession.sharedInstance().setActive(true)
      player.play()
      updateNowPlaying()
    } catch {
      wantsPlayback = false
      isPlaying = false
      self.error = error.localizedDescription
    }
  }

  func pause(preserveInterruptionIntent: Bool = false) {
    if !preserveInterruptionIntent { resumeAfterInterruption = false }
    wantsPlayback = false
    player.pause()
    isPlaying = false
    isLoading = false
    let snapshot = checkpointSnapshot()
    Task { await persist(snapshot) }
    updateNowPlaying()
  }

  func seek(by delta: Double) { seek(to: position + delta) }

  func seek(to seconds: Double) {
    guard !isSeeking, seconds.isFinite else { return }
    let request = requestID
    let target = max(0, duration > 0 ? min(duration, seconds) : seconds)
    if player.currentItem == nil, let episode {
      position = target
      let snapshot = (episode.id, target, duration)
      Task { await persist(snapshot) }
      updateNowPlaying()
      return
    }
    guard player.currentItem?.status == .readyToPlay else { return }
    isSeeking = true
    player.seek(to: CMTime(seconds: target, preferredTimescale: 600)) { [weak self] finished in
      Task { @MainActor in
        guard let self, self.requestID == request else { return }
        self.isSeeking = false
        if finished {
          self.position = target
          await self.checkpoint()
        }
        self.updateNowPlaying()
      }
    }
  }

  private func checkpointSnapshot() -> (String, Double, Double)? {
    guard let episode, !isSeeking, player.currentItem?.status == .readyToPlay else { return nil }
    let time = player.currentTime().seconds
    guard time.isFinite else { return nil }
    let duration = player.currentItem?.duration.seconds ?? 0
    return (episode.id, max(0, time), duration.isFinite ? max(0, duration) : 0)
  }

  private func persist(_ snapshot: (String, Double, Double)?) async {
    guard let (id, time, duration) = snapshot else { return }
    do {
      try await database.saveProgress(
        episodeId: id, position: time, duration: duration, at: Date().ISO8601Format())
    } catch { self.error = error.localizedDescription }
  }

  func checkpoint() async { await persist(checkpointSnapshot()) }

  private func updateNowPlaying() {
    guard let episode else { return }
    MPNowPlayingInfoCenter.default().nowPlayingInfo = [
      MPMediaItemPropertyTitle: episode.title,
      MPMediaItemPropertyPlaybackDuration: duration,
      MPNowPlayingInfoPropertyElapsedPlaybackTime: position,
      MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? 1.0 : 0.0,
    ]
  }
}

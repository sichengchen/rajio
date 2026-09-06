import Combine
import AVFoundation
import MediaPlayer
import RajioCore
import RajioLibrary

@MainActor
final class AudioPlayer: ObservableObject {
    @Published private(set) var episode: Episode?
    @Published private(set) var isPlaying = false
    @Published private(set) var position: Double = 0
    @Published var error: String?
    private let player = AVPlayer()
    private let database: LibraryDatabase
    private var timeObserver: Any?
    private var itemObserver: NSKeyValueObservation?
    private var notifications: [NSObjectProtocol] = []
    private var resumeAfterInterruption = false
    private var requestID = UUID()

    init(database: LibraryDatabase) {
        self.database = database
        timeObserver = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 5, preferredTimescale: 600), queue: .main) { [weak self] time in
            Task { @MainActor in
                guard let self else { return }
                self.position = max(0, time.seconds.isFinite ? time.seconds : 0)
                self.isPlaying = self.player.rate > 0
                if self.isPlaying { await self.checkpoint() }
                self.updateNowPlaying()
            }
        }
        let center = MPRemoteCommandCenter.shared()
        center.playCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.resume() }; return .success
        }
        center.pauseCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.pause() }; return .success
        }
        center.skipForwardCommand.preferredIntervals = [30]
        center.skipBackwardCommand.preferredIntervals = [30]
        center.skipForwardCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.seek(by: 30) }; return .success
        }
        center.skipBackwardCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.seek(by: -30) }; return .success
        }
        notifications.append(NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
            let type = (note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt) ?? 0
            let options = (note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt) ?? 0
            Task { @MainActor in
                guard let self else { return }
                if type == AVAudioSession.InterruptionType.began.rawValue {
                    self.resumeAfterInterruption = self.isPlaying
                    self.pause(preserveInterruptionIntent: true)
                } else {
                    if self.resumeAfterInterruption && AVAudioSession.InterruptionOptions(rawValue: options).contains(.shouldResume) { self.resume() }
                    self.resumeAfterInterruption = false
                }
            }
        })
        notifications.append(NotificationCenter.default.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] note in
            let reason = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt
            if reason == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue {
                Task { @MainActor in self?.pause() }
            }
        })
        notifications.append(NotificationCenter.default.addObserver(forName: .AVPlayerItemFailedToPlayToEndTime, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.pause(); self?.error = String(localized: "Playback failed. Try again.") }
        })
        notifications.append(NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.pause() }
        })
    }

    func play(_ next: Episode) async {
        if episode?.id == next.id && player.currentItem?.status != .failed { resume(); return }
        pause()
        requestID = UUID()
        let request = requestID
        await checkpoint()
        do {
            let saved = try await database.progress(episodeId: next.id)
            guard requestID == request else { return }
            guard let url = URL(string: next.audioUrl), ["http", "https"].contains(url.scheme ?? "") else { throw URLError(.badURL) }
            episode = next
            position = saved?.position ?? 0
            let item = AVPlayerItem(url: url)
            itemObserver = item.observe(\.status, options: [.new]) { [weak self] item, _ in
                guard item.status == .failed else { return }
                Task { @MainActor in
                    self?.pause()
                    self?.error = String(localized: "Playback failed. Try again.")
                }
            }
            player.replaceCurrentItem(with: item)
            await player.seek(to: CMTime(seconds: position, preferredTimescale: 600))
            guard requestID == request else { return }
            resume()
        } catch { self.error = error.localizedDescription }
    }

    func resume() {
        guard episode != nil else { return }
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
            try AVAudioSession.sharedInstance().setActive(true)
            player.play()
            isPlaying = true
            updateNowPlaying()
        } catch { self.error = error.localizedDescription }
    }

    func pause(preserveInterruptionIntent: Bool = false) {
        requestID = UUID()
        if !preserveInterruptionIntent { resumeAfterInterruption = false }
        player.pause()
        isPlaying = false
        Task { await checkpoint() }
        updateNowPlaying()
    }

    func seek(by delta: Double) {
        let current = player.currentTime().seconds
        guard current.isFinite else { return }
        let duration = player.currentItem?.duration.seconds ?? 0
        let target = max(0, duration.isFinite && duration > 0 ? min(duration, current + delta) : current + delta)
        player.seek(to: CMTime(seconds: target, preferredTimescale: 600)) { [weak self] _ in
            Task { @MainActor in await self?.checkpoint() }
        }
    }

    func checkpoint() async {
        guard let episode else { return }
        let time = player.currentTime().seconds
        guard time.isFinite else { return }
        let duration = player.currentItem?.duration.seconds ?? 0
        do {
            try await database.saveProgress(episodeId: episode.id, position: max(0, time), duration: duration.isFinite ? max(0, duration) : 0, at: Date().ISO8601Format())
        } catch { self.error = error.localizedDescription }
    }

    private func updateNowPlaying() {
        guard let episode else { return }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = [
            MPMediaItemPropertyTitle: episode.title,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: position,
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? 1.0 : 0.0,
        ]
    }
}

import AVKit
import SwiftUI

struct PlayerView: View {
  @ObservedObject var audio: AudioPlayer
  @ObservedObject var model: LibraryModel
  @Environment(\.dismiss) private var dismiss
  @State private var scrub: Double = 0
  @State private var scrubbing = false
  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(spacing: 24) {
          if let episode = audio.episode {
            Artwork(url: episode.imageUrl, size: 240)
            Text(episode.title).font(.title2.bold()).multilineTextAlignment(.center)
            if audio.isLoading { ProgressView("Loading audio…") }
            VStack {
              Slider(
                value: Binding(get: { scrubbing ? scrub : audio.position }, set: { scrub = $0 }),
                in: 0...max(1, audio.duration, audio.position),
                onEditingChanged: { editing in
                  if editing {
                    scrub = audio.position
                    scrubbing = true
                  } else {
                    scrubbing = false
                    audio.seek(to: scrub)
                  }
                }
              ).accessibilityLabel("Playback position")
              HStack {
                Text(Duration.seconds(audio.position).formatted(.time(pattern: .hourMinuteSecond)))
                  .accessibilityIdentifier("elapsed-time")
                Spacer()
                Text(Duration.seconds(audio.duration).formatted(.time(pattern: .hourMinuteSecond)))
              }.font(.caption.monospacedDigit()).foregroundStyle(.secondary)
            }
            HStack(spacing: 32) {
              Button("Back 30 seconds", systemImage: "gobackward.30") { audio.seek(by: -30) }
              Button {
                audio.isPlaying ? audio.pause() : audio.resume()
              } label: {
                Label(
                  audio.isPlaying ? String(localized: "Pause") : String(localized: "Play"),
                  systemImage: audio.isPlaying ? "pause.fill" : "play.fill")
              }.font(.largeTitle).accessibilityIdentifier("player-toggle")
              Button("Forward 30 seconds", systemImage: "goforward.30") { audio.seek(by: 30) }
                .accessibilityIdentifier("player-forward")
            }.labelStyle(.iconOnly).font(.title).buttonStyle(.borderless).padding(.vertical)
            HStack {
              Menu {
                ForEach([0.75, 1.0, 1.25, 1.5, 1.75, 2.0], id: \.self) { speed in
                  Button(speed.formatted() + "×") { audio.setSpeed(speed) }
                }
              } label: {
                Text(audio.speed.formatted() + "×")
              }.accessibilityLabel("Playback speed")
              Spacer()
              RoutePicker().frame(width: 44, height: 44).accessibilityLabel("Audio output")
              Spacer()
              Button("Next Episode", systemImage: "forward.end.fill") {
                Task { await audio.playNext() }
              }.labelStyle(.iconOnly)
            }
            if let error = audio.error { Text(error).foregroundStyle(.red) }
            if !model.queue.isEmpty {
              VStack(alignment: .leading, spacing: 12) {
                Text("Up Next").font(.headline)
                ForEach(
                  model.queue.compactMap { id in model.episodes.first { $0.id == id } }, id: \.id
                ) { queued in
                  Button(queued.title) {
                    Task {
                      await audio.play(queued)
                      await model.setCollection("queue", episode: queued, included: false)
                    }
                  }.buttonStyle(.plain)
                }
              }.frame(maxWidth: .infinity, alignment: .leading)
            }
          }
        }.padding(24)
      }
      .navigationTitle("Now Playing").navigationBarTitleDisplayMode(.inline)
      .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
    }
  }
}

private struct RoutePicker: UIViewRepresentable {
  func makeUIView(context: Context) -> AVRoutePickerView { AVRoutePickerView() }
  func updateUIView(_ view: AVRoutePickerView, context: Context) {}
}

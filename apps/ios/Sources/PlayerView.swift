import AVKit
import MediaPlayer
import SwiftUI

struct PlayerView: View {
  @ObservedObject var audio: AudioPlayer
  @ObservedObject var model: LibraryModel
  @Environment(\.dismiss) private var dismiss
  @State private var scrub: Double = 0
  @State private var scrubbing = false
  @State private var queue = false
  @State private var notes = false
  var body: some View {
    GeometryReader { geometry in
      ZStack {
        Color(uiColor: .systemBackground).ignoresSafeArea()
        if let url = audio.episode?.imageUrl.flatMap(URL.init(string:)) {
          AsyncImage(url: url) { image in
            image.resizable().scaledToFill().blur(radius: 80).opacity(0.24)
          } placeholder: {
            Color.clear
          }
          .frame(width: geometry.size.width, height: geometry.size.height).clipped()
          .ignoresSafeArea()
        }
        ScrollView {
          VStack(spacing: 20) {
            Button("Done", systemImage: "chevron.down") { dismiss() }
              .labelStyle(.iconOnly).font(.headline).foregroundStyle(.secondary).frame(
                width: 60, height: 44)
            if let episode = audio.episode {
              Artwork(url: episode.imageUrl, size: max(0, min(geometry.size.width - 64, 360)))
                .shadow(color: .black.opacity(0.2), radius: 22, y: 12)
                .padding(.bottom, 12)
              HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 5) {
                  Text(episode.title).font(.title3.weight(.semibold)).lineLimit(3)
                  Text(model.podcasts.first { $0.id == episode.podcastId }?.title ?? "")
                    .font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                }.frame(maxWidth: .infinity, alignment: .leading)
                Menu("Episode actions", systemImage: "ellipsis") {
                  EpisodeMenu(episode: episode, model: model, audio: audio)
                }
                .font(.title3).frame(width: 44, height: 44).nativeGlassControl().buttonBorderShape(
                  .circle)
              }
              VStack(spacing: 3) {
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
                ).accessibilityLabel("Playback position").tint(.primary)
                HStack {
                  Text(
                    Duration.seconds(audio.position).formatted(.time(pattern: .hourMinuteSecond))
                  ).accessibilityIdentifier("elapsed-time")
                  Spacer()
                  if audio.isLoading { ProgressView().controlSize(.mini) }
                  Spacer()
                  Text(
                    verbatim: "−"
                      + Duration.seconds(max(0, audio.duration - audio.position)).formatted(
                        .time(pattern: .minuteSecond)))
                }.font(.caption.monospacedDigit()).foregroundStyle(.secondary)
              }
              HStack {
                speedMenu
                Spacer()
                Button("Back 30 seconds", systemImage: "gobackward.30") { audio.seek(by: -30) }
                  .font(.system(size: 26)).frame(width: 44, height: 44)
                Spacer()
                Button {
                  audio.isPlaying ? audio.pause() : audio.resume()
                } label: {
                  Image(systemName: audio.isPlaying ? "pause.fill" : "play.fill").font(
                    .system(size: 48)
                  ).frame(width: 64, height: 64)
                }.accessibilityLabel(audio.isPlaying ? L10n.text("Pause") : L10n.text("Play"))
                  .accessibilityIdentifier("player-toggle")
                Spacer()
                Button("Forward 30 seconds", systemImage: "goforward.30") { audio.seek(by: 30) }
                  .font(.system(size: 26)).frame(width: 44, height: 44).accessibilityIdentifier("player-forward")
                Spacer()
                Button("Next Episode", systemImage: "forward.end.fill") {
                  Task { await audio.playNext() }
                }
                .font(.body).frame(width: 44, height: 44).disabled(model.queue.isEmpty)
              }.labelStyle(.iconOnly).buttonStyle(.plain).padding(.vertical, 4)
              VolumeControl().frame(height: 34).accessibilityLabel("Volume")
              HStack {
                Button("Episode Notes", systemImage: "text.quote") { notes = true }
                  .frame(width: 48, height: 48)
                Spacer()
                RoutePicker().frame(width: 48, height: 48).accessibilityLabel("Audio output")
                Spacer()
                Button("Queue", systemImage: "list.bullet") { queue = true }.frame(
                  width: 48, height: 48)
              }.labelStyle(.iconOnly).font(.title2).foregroundStyle(.secondary)
              if let error = audio.error { Text(error).font(.subheadline).foregroundStyle(.red) }
            }
          }.padding(.horizontal, 32).padding(.top, 8).padding(.bottom, 24)
            .frame(maxWidth: 560).frame(maxWidth: .infinity)
        }
      }
    }.presentationDragIndicator(.hidden)
      .sheet(isPresented: $queue) {
        NavigationStack {
          CollectionView(kind: "queue", title: "Queue", model: model, audio: audio)
            .toolbar {
              ToolbarItem(placement: .confirmationAction) { Button("Done") { queue = false } }
            }
        }.presentationDetents([.medium, .large])
      }
      .sheet(isPresented: $notes) {
        NavigationStack {
          if let episode = audio.episode {
            ShowNotes(html: episode.content ?? episode.description).navigationTitle("Episode Notes")
              .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { notes = false } }
              }
          }
        }
      }
  }
  private var speedMenu: some View {
    Menu {
      ForEach([0.75, 1.0, 1.25, 1.5, 1.75, 2.0], id: \.self) { speed in
        Button(speed.formatted(.number.locale(L10n.locale)) + "×") { audio.setSpeed(speed) }
      }
    } label: {
      Text(audio.speed.formatted(.number.locale(L10n.locale)) + "×").font(
        .subheadline.weight(.semibold)
      ).frame(minWidth: 44, minHeight: 44)
    }
    .accessibilityLabel("Playback speed")
  }
}

private struct RoutePicker: UIViewRepresentable {
  func makeUIView(context: Context) -> AVRoutePickerView { AVRoutePickerView() }
  func updateUIView(_ view: AVRoutePickerView, context: Context) {}
}
private struct VolumeControl: UIViewRepresentable {
  func makeUIView(context: Context) -> MPVolumeView {
    let view = MPVolumeView()
    view.showsRouteButton = false
    return view
  }
  func updateUIView(_ view: MPVolumeView, context: Context) {}
}

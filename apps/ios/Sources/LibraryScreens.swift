import RajioCore
import SwiftUI

struct HomeView: View {
  @ObservedObject var model: LibraryModel
  @ObservedObject var audio: AudioPlayer
  @Binding var adding: Bool
  @Binding var fullPlayer: Bool
  var body: some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 28) {
        if model.podcasts.isEmpty { WelcomeView(adding: $adding) }
        if let episode = audio.episode {
          VStack(alignment: .leading, spacing: 16) {
            Text("Continue Listening").font(.title2.bold())
            Button {
              fullPlayer = true
            } label: {
              HStack(alignment: .center, spacing: 18) {
                Artwork(url: episode.imageUrl, size: 112)
                VStack(alignment: .leading, spacing: 8) {
                  Text(model.podcasts.first { $0.id == episode.podcastId }?.title ?? "").font(
                    .caption.weight(.semibold)
                  ).foregroundStyle(.secondary)
                  Text(episode.title).font(.headline).lineLimit(3)
                  ProgressView(value: min(audio.position / max(audio.duration, 1), 1)).tint(
                    RajioStyle.accent)
                  Text(Duration.seconds(audio.position).formatted(.time(pattern: .minuteSecond)))
                    .font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                }
              }.padding(16).background(
                Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 20))
            }.buttonStyle(.plain)
          }
        }
        if !model.episodes.isEmpty {
          VStack(alignment: .leading, spacing: 4) {
            Text("Latest Episodes").font(.title2.bold()).padding(.bottom, 12)
            ForEach(model.episodes.prefix(30), id: \.id) { episode in
              EpisodeRow(episode: episode, model: model, audio: audio)
              Divider().padding(.vertical, 8)
            }
          }
        }
        RefreshStatusView(model: model)
      }.padding(20)
    }.navigationTitle("Home").refreshable { await model.refresh(force: true) }
  }
}

struct ShowGrid: View {
  @ObservedObject var model: LibraryModel
  @ObservedObject var audio: AudioPlayer
  let podcasts: [Podcast]
  var onRemove: ((Podcast) -> Void)?
  @Environment(\.dynamicTypeSize) private var typeSize
  var body: some View {
    LazyVGrid(
      columns: [
        GridItem(.adaptive(minimum: typeSize.isAccessibilitySize ? 240 : 150), spacing: 18)
      ], alignment: .leading, spacing: 24
    ) {
      ForEach(podcasts, id: \.id) { podcast in
        NavigationLink {
          ShowView(podcast: podcast, model: model, audio: audio)
        } label: {
          VStack(alignment: .leading, spacing: 8) {
            ArtworkTile(url: podcast.imageUrl).aspectRatio(1, contentMode: .fit)
              .shadow(color: .black.opacity(0.08), radius: 6, y: 3)
            Text(podcast.title).font(.subheadline.weight(.medium)).lineLimit(2)
            if let author = podcast.author {
              Text(author).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
          }.frame(maxWidth: .infinity, alignment: .leading)
        }.buttonStyle(.plain)
          .contextMenu {
            if let onRemove { Button("Unsubscribe", role: .destructive) { onRemove(podcast) } }
          }
      }
    }
  }
}

struct CollectionView: View {
  let kind: String
  let title: LocalizedStringKey
  @ObservedObject var model: LibraryModel
  @ObservedObject var audio: AudioPlayer
  @EnvironmentObject private var downloads: DownloadManager
  @State private var query = ""
  private var episodes: [Episode] {
    let ids =
      kind == "downloads"
      ? Array(downloads.records.keys) : (kind == "queue" ? model.queue : model.favorites)
    let items =
      kind == "latest"
      ? model.episodes : ids.compactMap { id in model.episodes.first { $0.id == id } }
    return items.filter { query.isEmpty || $0.title.localizedCaseInsensitiveContains(query) }
  }
  var body: some View {
    List {
      ForEach(episodes, id: \.id) { episode in
        EpisodeRow(episode: episode, model: model, audio: audio).listRowInsets(
          EdgeInsets(top: 14, leading: 20, bottom: 14, trailing: 20))
      }
      .onDelete { offsets in
        let removed = offsets.map { episodes[$0] }
        Task {
          for episode in removed {
            if kind == "downloads" {
              await downloads.remove(episode.id)
            } else {
              await model.setCollection(kind, episode: episode, included: false)
            }
          }
        }
      }
      .onMove { offsets, destination in
        var moved = episodes
        moved.move(fromOffsets: offsets, toOffset: destination)
        Task {
          for (index, episode) in moved.enumerated() {
            await model.setCollection(kind, episode: episode, included: true, index: index)
          }
        }
      }.deleteDisabled(kind == "latest").moveDisabled(kind != "queue" || !query.isEmpty)
    }.listStyle(.plain).navigationTitle(title)
      .searchable(text: $query, prompt: "Search library")
      .overlay {
        if episodes.isEmpty {
          ContentUnavailableView(
            "No episodes", systemImage: kind == "downloads" ? "arrow.down.circle" : "square.stack")
        }
      }
      .toolbar { if kind == "queue" { EditButton() } }
  }
}

struct RefreshStatusView: View {
  @ObservedObject var model: LibraryModel
  var body: some View {
    if model.isRefreshing {
      ProgressView("Refreshing podcasts…").font(.caption).foregroundStyle(.secondary)
    }
    if !model.refreshFailures.isEmpty {
      DisclosureGroup("Refresh status") {
        ForEach(model.refreshFailures, id: \.self) {
          Text($0).font(.caption).foregroundStyle(.secondary)
        }
        Button("Retry") { Task { await model.refresh(force: true) } }
      }.font(.subheadline)
    }
  }
}

struct WelcomeView: View {
  @Binding var adding: Bool
  var body: some View {
    VStack(spacing: 18) {
      Image(systemName: "headphones").font(.system(size: 58, weight: .light)).foregroundStyle(
        RajioStyle.accent
      ).padding(.top, 20)
      Text("Your next great listen.").font(.title.bold()).multilineTextAlignment(.center)
      Text("Follow the shows you love. Take every episode with you.")
        .font(.body).foregroundStyle(.secondary).multilineTextAlignment(.center)
      Button("Add Podcast") { adding = true }.nativeProminentControl().controlSize(.large)
    }.frame(maxWidth: .infinity).padding(.vertical, 20)
  }
}

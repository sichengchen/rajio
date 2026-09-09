import RajioCore
import RajioLibrary
import SwiftUI
import UniformTypeIdentifiers

struct LibraryView: View {
  @StateObject private var model: LibraryModel
  @ObservedObject private var downloads: DownloadManager
  @StateObject private var audio: AudioPlayer
  @State private var adding = false
  @State private var importing = false
  @State private var exporting = false
  @State private var fullPlayer = false
  @State private var section = "all"
  @State private var query = ""
  @Environment(\.scenePhase) private var phase

  init(database: LibraryDatabase, downloads: DownloadManager) {
    self.downloads = downloads
    _model = StateObject(wrappedValue: LibraryModel(database: database))
    _audio = StateObject(wrappedValue: AudioPlayer(database: database))
  }

  var body: some View {
    NavigationStack {
      List {
        if model.podcasts.isEmpty {
          ContentUnavailableView {
            Label("Welcome to Rajio", systemImage: "radio")
          } description: {
            Text("Add a podcast to start listening.")
          } actions: {
            Button("Add Podcast") { adding = true }.buttonStyle(.borderedProminent)
          }
          .listRowBackground(Color.clear)
        } else {
          Section {
            Picker("Library filter", selection: $section) {
              Text("Shows").tag("all")
              Text("Favorites").tag("favorites")
              Text("Queue").tag("queue")
              Text("Downloads").tag("downloads")
            }.pickerStyle(.segmented)
          }
          if section == "all" {
            ForEach(
              model.podcasts.filter {
                query.isEmpty || $0.title.localizedCaseInsensitiveContains(query)
              }, id: \.id
            ) { podcast in
              NavigationLink {
                ShowView(podcast: podcast, model: model, audio: audio)
              } label: {
                HStack {
                  Artwork(url: podcast.imageUrl, size: 56)
                  VStack(alignment: .leading, spacing: 4) {
                    Text(podcast.title).font(.headline)
                    if let author = podcast.author {
                      Text(author).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
                    }
                  }
                }.padding(.vertical, 3)
              }
              .swipeActions {
                Button("Unsubscribe", role: .destructive) { Task { await model.remove(podcast) } }
              }
            }
          } else {
            let ids =
              section == "downloads"
              ? downloads.records.keys.sorted()
              : (section == "queue" ? model.queue : model.favorites)
            ForEach(
              ids.compactMap { id in model.episodes.first { $0.id == id } }.filter {
                query.isEmpty || $0.title.localizedCaseInsensitiveContains(query)
              }, id: \.id
            ) { episode in
              EpisodeRow(episode: episode, model: model, audio: audio)
            }
            .onDelete { offsets in
              let displayed = ids.compactMap { id in model.episodes.first { $0.id == id } }.filter {
                query.isEmpty || $0.title.localizedCaseInsensitiveContains(query)
              }
              Task {
                for index in offsets {
                  if section == "downloads" {
                    await downloads.remove(displayed[index].id)
                  } else {
                    await model.setCollection(section, episode: displayed[index], included: false)
                  }
                }
              }
            }
            .onMove { offsets, destination in
              var moved = ids
              moved.move(fromOffsets: offsets, toOffset: destination)
              Task {
                for (index, id) in moved.enumerated() {
                  if let episode = model.episodes.first(where: { $0.id == id }) {
                    await model.setCollection(
                      section, episode: episode, included: true, index: index)
                  }
                }
              }
            }
            .moveDisabled(!query.isEmpty || section != "queue")
            if ids.isEmpty { Text("No episodes").foregroundStyle(.secondary) }
          }
        }
        if model.isRefreshing { ProgressView("Refreshing podcasts…") }
        if !model.refreshFailures.isEmpty {
          Section("Refresh status") {
            ForEach(model.refreshFailures, id: \.self) {
              Text($0).font(.caption).foregroundStyle(.secondary)
            }
            Button("Retry") { Task { await model.refresh(force: true) } }
          }
        }
      }
      .searchable(
        text: $query, placement: .navigationBarDrawer(displayMode: .always),
        prompt: "Search library"
      )
      .navigationTitle("Library")
      .toolbar {
        ToolbarItem(placement: .topBarLeading) {
          Menu("Library actions", systemImage: "ellipsis.circle") {
            Button("Import OPML", systemImage: "square.and.arrow.down") { importing = true }
            Button("Export OPML", systemImage: "square.and.arrow.up") { exporting = true }.disabled(
              model.podcasts.isEmpty)
            Button("Refresh podcasts", systemImage: "arrow.clockwise") {
              Task { await model.refresh(force: true) }
            }
          }
        }
        ToolbarItem(placement: .topBarTrailing) {
          Button("Add Podcast", systemImage: "plus") { adding = true }
        }
        ToolbarItem(placement: .topBarTrailing) { if section == "queue" { EditButton() } }
      }
      .refreshable { await model.refresh(force: true) }
      .sheet(isPresented: $adding) { AddPodcastView(model: model) }
      .sheet(isPresented: $fullPlayer) { PlayerView(audio: audio, model: model) }
      .fileImporter(isPresented: $importing, allowedContentTypes: [.xml, .data]) { result in
        Task {
          do {
            let url = try result.get()
            let access = url.startAccessingSecurityScopedResource()
            defer { if access { url.stopAccessingSecurityScopedResource() } }
            await model.importOPML(try Data(contentsOf: url))
          } catch { model.error = error.localizedDescription }
        }
      }
      .fileExporter(
        isPresented: $exporting, document: OPMLDocument(text: model.exportOPML()),
        contentType: .xml, defaultFilename: "Rajio.opml"
      ) { result in
        if case .failure(let error) = result { model.error = error.localizedDescription }
      }
      .task {
        await downloads.restore()
        await model.reload()
        await audio.restore()
        await model.refresh()
      }
      .onChange(of: phase) { _, value in
        Task {
          if value == .active { await model.refresh() } else { await audio.checkpoint() }
        }
      }
    }
    .environmentObject(downloads)
    .safeAreaInset(edge: .bottom) {
      if let episode = audio.episode {
        HStack(spacing: 12) {
          Button {
            fullPlayer = true
          } label: {
            HStack {
              Artwork(url: episode.imageUrl, size: 44)
              VStack(alignment: .leading) {
                Text(episode.title).font(.subheadline).lineLimit(2)
                if audio.isLoading {
                  Text("Loading audio…").font(.caption).foregroundStyle(.secondary)
                }
              }
            }.frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
          }.buttonStyle(.plain).accessibilityHint("Open player").accessibilityIdentifier(
            "mini-player")
          Button {
            audio.isPlaying ? audio.pause() : audio.resume()
          } label: {
            Label(
              audio.isPlaying ? String(localized: "Pause") : String(localized: "Play"),
              systemImage: audio.isPlaying ? "pause.fill" : "play.fill")
          }.labelStyle(.iconOnly).font(.title2).padding(8)
          Button("Forward 30 seconds", systemImage: "goforward.30") { audio.seek(by: 30) }
            .labelStyle(.iconOnly).padding(8)
        }.padding(.horizontal).padding(.vertical, 10).background(.regularMaterial)
      }
    }
    .alert(
      "Something went wrong",
      isPresented: Binding(
        get: {
          !adding && !fullPlayer
            && (model.error != nil || audio.error != nil || downloads.error != nil)
        },
        set: { _ in })
    ) {
      Button("OK", role: .cancel) {
        model.error = nil
        audio.error = nil
        downloads.error = nil
      }
    } message: {
      Text(model.error ?? audio.error ?? downloads.error ?? "")
    }
  }
}

struct Artwork: View {
  let url: String?
  let size: CGFloat
  var body: some View {
    AsyncImage(url: url.flatMap(URL.init(string:))) { image in
      image.resizable().scaledToFill()
    } placeholder: {
      Image(systemName: "waveform").font(.title2).frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.quaternary)
    }
    .frame(width: size, height: size).clipShape(RoundedRectangle(cornerRadius: size * 0.15))
    .accessibilityHidden(true)
  }
}

struct OPMLDocument: FileDocument {
  static var readableContentTypes: [UTType] { [.xml, .data] }
  var text: String
  init(text: String) { self.text = text }
  init(configuration: ReadConfiguration) throws {
    text = String(decoding: configuration.file.regularFileContents ?? Data(), as: UTF8.self)
  }
  func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
    FileWrapper(regularFileWithContents: Data(text.utf8))
  }
}

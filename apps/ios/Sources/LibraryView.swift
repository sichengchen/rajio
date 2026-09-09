import RajioCore
import RajioLibrary
import SwiftUI
import UniformTypeIdentifiers

struct LibraryView: View {
  @StateObject private var model: LibraryModel
  @ObservedObject private var downloads: DownloadManager
  @StateObject private var audio: AudioPlayer
  @State private var tab = "library"
  @AppStorage("appLanguage", store: L10n.defaults) private var language = "system"
  @State private var settings = false
  @State private var adding = false
  @State private var importing = false
  @State private var exporting = false
  @State private var fullPlayer = false
  @Environment(\.scenePhase) private var phase

  init(database: LibraryDatabase, downloads: DownloadManager) {
    self.downloads = downloads
    _model = StateObject(wrappedValue: LibraryModel(database: database))
    _audio = StateObject(wrappedValue: AudioPlayer(database: database))
  }

  var body: some View {
    Group {
      if #available(iOS 26.1, *) {
        tabs.tabViewBottomAccessory(isEnabled: audio.episode != nil) { miniPlayer }
      } else {
        tabs.safeAreaInset(edge: .bottom, spacing: 0) {
          if audio.episode != nil { miniPlayer.background(.regularMaterial) }
        }
      }
    }
    .sheet(isPresented: $settings) { SettingsView(database: model.database, audio: audio) }
    .sheet(isPresented: $adding) { AddPodcastView(model: model) }
    .sheet(isPresented: $fullPlayer) { PlayerView(audio: audio, model: model) }
    .fileImporter(isPresented: $importing, allowedContentTypes: [.xml, .data]) { result in
      Task {
        do {
          let url = try result.get()
          let access = url.startAccessingSecurityScopedResource()
          defer { if access { url.stopAccessingSecurityScopedResource() } }
          await model.importOPML(try Data(contentsOf: url))
        } catch { model.error = L10n.error(error) }
      }
    }
    .fileExporter(
      isPresented: $exporting, document: OPMLDocument(text: model.exportOPML()),
      contentType: .xml, defaultFilename: "Rajio.opml"
    ) { result in
      if case .failure(let error) = result { model.error = L10n.error(error) }
    }
    .task {
      await downloads.restore()
      await model.reload()
      await audio.restore()
      await model.refresh()
    }
    .onChange(of: phase) { _, value in
      Task { if value == .active { await model.refresh() } else { await audio.checkpoint() } }
    }
    .onChange(of: audio.episode?.id) { _, _ in Task { await model.reload() } }
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
    .environmentObject(downloads)
    .tint(RajioStyle.accent)
    .environment(\.locale, Locale(identifier: language == "system" ? L10n.language : language))
  }

  @ViewBuilder private var tabs: some View {
    if #available(iOS 18.0, *) {
      TabView(selection: $tab) {
        Tab("Home", systemImage: "house.fill", value: "home") { homeTab }
        Tab("Library", systemImage: "square.stack.fill", value: "library") { libraryTab }
        Tab("Search", systemImage: "magnifyingglass", value: "search", role: .search) { searchTab }
      }
    } else {
      TabView(selection: $tab) {
        homeTab.tabItem { Label("Home", systemImage: "house.fill") }.tag("home")
        libraryTab.tabItem { Label("Library", systemImage: "square.stack.fill") }.tag("library")
        searchTab.tabItem { Label("Search", systemImage: "magnifyingglass") }.tag("search")
      }
    }
  }
  private var homeTab: some View {
    NavigationStack {
      HomeView(model: model, audio: audio, adding: $adding, fullPlayer: $fullPlayer).toolbar {
        settingsButton
      }
    }
  }
  private var searchTab: some View {
    NavigationStack { PodcastSearchView(model: model, audio: audio, adding: $adding) }
  }
  private var libraryTab: some View {
    NavigationStack {
      library
        .navigationTitle(L10n.text("Library"))
        .toolbar {
          ToolbarItem(placement: .topBarTrailing) {
            Button("Add Podcast", systemImage: "plus") { adding = true }
          }
          ToolbarItem(placement: .topBarTrailing) {
            Menu("Library actions", systemImage: "ellipsis.circle") {
              Button("Settings", systemImage: "gearshape") { settings = true }
              Button("Add Podcast", systemImage: "plus") { adding = true }
              Button("Import OPML", systemImage: "square.and.arrow.down") { importing = true }
              Button("Export OPML", systemImage: "square.and.arrow.up") { exporting = true }
                .disabled(model.podcasts.isEmpty)
              Button("Refresh podcasts", systemImage: "arrow.clockwise") {
                Task { await model.refresh(force: true) }
              }
            }
          }
        }
    }
  }

  @ToolbarContentBuilder private var settingsButton: some ToolbarContent {
    ToolbarItem(placement: .topBarTrailing) {
      Button("Settings", systemImage: "person.crop.circle") { settings = true }
    }
  }

  private var library: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 28) {
        VStack(spacing: 0) {
          collectionLink("Shows", icon: "square.stack", kind: "shows")
          collectionLink("Favorites", icon: "heart", kind: "favorites")
          collectionLink("Downloads", icon: "arrow.down.circle", kind: "downloads")
          collectionLink("Latest Episodes", icon: "clock", kind: "latest")
          collectionLink("Queue", icon: "text.line.first.and.arrowtriangle.forward", kind: "queue")
        }
        if model.podcasts.isEmpty {
          WelcomeView(adding: $adding)
        } else {
          VStack(alignment: .leading, spacing: 16) {
            Text("Recently Updated").font(.title2.bold())
            ShowGrid(model: model, audio: audio, podcasts: model.podcasts, onRemove: remove)
          }
        }
        RefreshStatusView(model: model)
      }.padding(.horizontal, 20).padding(.bottom, 24)
    }
    .background(Color(uiColor: .systemBackground))
    .refreshable { await model.refresh(force: true) }
  }

  private func collectionLink(_ title: LocalizedStringKey, icon: String, kind: String) -> some View
  {
    NavigationLink {
      if kind == "shows" {
        ScrollView {
          ShowGrid(model: model, audio: audio, podcasts: model.podcasts, onRemove: remove).padding(
            20)
        }
        .navigationTitle("Shows")
      } else {
        CollectionView(kind: kind, title: title, model: model, audio: audio)
      }
    } label: {
      HStack(spacing: 16) {
        Image(systemName: icon).font(.title2).foregroundStyle(RajioStyle.accent).frame(width: 28)
        Text(title).font(.title3).foregroundStyle(.primary)
        Spacer()
        Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(
          .tertiary)
      }.padding(.vertical, 13).contentShape(Rectangle())
    }.buttonStyle(.plain)
      .overlay(alignment: .bottom) { Divider().padding(.leading, 44) }
  }

  private func remove(_ podcast: Podcast) {
    Task {
      await audio.stop(podcastId: podcast.id)
      for episode in model.episodes where episode.podcastId == podcast.id {
        await downloads.remove(episode.id)
      }
      await model.remove(podcast)
    }
  }

  private var miniPlayer: some View {
    Group {
      if let episode = audio.episode {
        HStack(spacing: 12) {
          Button {
            fullPlayer = true
          } label: {
            HStack(spacing: 10) {
              Artwork(url: episode.imageUrl, size: 42)
              VStack(alignment: .leading, spacing: 2) {
                Text(episode.title).font(.subheadline.weight(.medium)).lineLimit(1)
                Text(
                  audio.isLoading
                    ? L10n.text("Loading audio…")
                    : (model.podcasts.first { $0.id == episode.podcastId }?.title ?? "")
                )
                .font(.caption).foregroundStyle(.secondary).lineLimit(1)
              }.frame(maxWidth: .infinity, alignment: .leading)
            }.contentShape(Rectangle())
          }.buttonStyle(.plain).accessibilityHint("Open player").accessibilityIdentifier(
            "mini-player")
          Button {
            audio.isPlaying ? audio.pause() : audio.resume()
          } label: {
            Image(systemName: audio.isPlaying ? "pause.fill" : "play.fill").font(.title2)
          }.accessibilityLabel(audio.isPlaying ? L10n.text("Pause") : L10n.text("Play"))
            .frame(width: 44, height: 44).foregroundStyle(.primary)
          Button("Forward 30 seconds", systemImage: "goforward.30") { audio.seek(by: 30) }
            .labelStyle(.iconOnly).font(.title2).frame(width: 44, height: 44).foregroundStyle(
              .primary)
        }.padding(.horizontal, 12).padding(.vertical, 7)
      }
    }
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

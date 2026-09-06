import SwiftUI
import RajioCore
import RajioLibrary

struct LibraryView: View {
    @StateObject private var model: LibraryModel
    @StateObject private var audio: AudioPlayer
    @State private var adding = false
    @State private var feedURL = ""
    @Environment(\.scenePhase) private var phase

    init(database: LibraryDatabase) {
        _model = StateObject(wrappedValue: LibraryModel(database: database))
        _audio = StateObject(wrappedValue: AudioPlayer(database: database))
    }

    var body: some View {
        NavigationStack {
            Group {
                if model.podcasts.isEmpty {
                    ContentUnavailableView {
                        Label("Welcome to Rajio", systemImage: "radio")
                    } description: {
                        Text("Add a podcast to start listening.")
                    } actions: {
                        Button("Add Podcast") { adding = true }.buttonStyle(.borderedProminent)
                    }
                } else {
                    List(model.podcasts, id: \.id) { podcast in
                        NavigationLink {
                            EpisodeListView(podcast: podcast, model: model, audio: audio)
                        } label: {
                            Label(podcast.title, systemImage: "podcasts")
                        }
                        .swipeActions {
                            Button("Unsubscribe", role: .destructive) { Task { await model.remove(podcast) } }
                        }
                    }
                }
            }
            .navigationTitle("Library")
            .toolbar { Button("Add Podcast", systemImage: "plus") { adding = true } }
            .sheet(isPresented: $adding) {
                NavigationStack {
                    Form {
                        TextField("Feed URL", text: $feedURL).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                        if model.isLoading { ProgressView("Adding podcast…") }
                        if let error = model.error { Text(error).foregroundStyle(.red) }
                    }
                    .navigationTitle("Add Podcast")
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { adding = false } }
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Add") { Task { if await model.subscribe(feedURL) { adding = false; feedURL = "" } } }
                                .disabled(model.isLoading || feedURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        }
                    }
                }
            }
            .task { await model.reload() }
            .onChange(of: phase) { _, value in
                if value != .active { Task { await audio.checkpoint() } }
            }
        }
        .safeAreaInset(edge: .bottom) { playerBar }
            .alert("Something went wrong", isPresented: Binding(get: { !adding && (model.error != nil || audio.error != nil) }, set: { if !$0 { model.error = nil; audio.error = nil } })) {
                Button("OK", role: .cancel) { model.error = nil; audio.error = nil }
            } message: { Text(model.error ?? audio.error ?? "") }

    }

    @ViewBuilder
    private var playerBar: some View {
                if let episode = audio.episode {
                    HStack {
                        Text(episode.title).font(.subheadline).lineLimit(1)
                        Spacer()
                        Button("Back 30 seconds", systemImage: "gobackward.30") { audio.seek(by: -30) }.labelStyle(.iconOnly)
                        Button {
                            if audio.isPlaying { audio.pause() } else { audio.resume() }
                        } label: {
                            Label(audio.isPlaying ? String(localized: "Pause") : String(localized: "Play"), systemImage: audio.isPlaying ? "pause.fill" : "play.fill")
                        }.labelStyle(.iconOnly)
                        Button("Forward 30 seconds", systemImage: "goforward.30") { audio.seek(by: 30) }.labelStyle(.iconOnly)
                    }.padding().background(.regularMaterial)
                }
    }
}

private struct EpisodeListView: View {
    let podcast: Podcast
    @ObservedObject var model: LibraryModel
    @ObservedObject var audio: AudioPlayer
    @State private var episodes: [Episode] = []
    var body: some View {
        List(episodes, id: \.id) { episode in
            Button { Task { await audio.play(episode) } } label: {
                VStack(alignment: .leading, spacing: 6) {
                    Text(episode.title).font(.headline).foregroundStyle(.primary)
                    if let date = episode.publishedAt.flatMap({ ISO8601DateFormatter().date(from: $0) }) {
                        Text(date, style: .date).font(.caption).foregroundStyle(.secondary)
                    }
                }.padding(.vertical, 4)
            }
        }
        .overlay { if episodes.isEmpty { ContentUnavailableView("No episodes", systemImage: "headphones") } }
        .navigationTitle(podcast.title)
        .task { await load() }
        .refreshable { _ = await model.subscribe(podcast.feedUrl); await load() }
    }
    private func load() async {
        do { episodes = try await model.database.episodes(podcastId: podcast.id) }
        catch { model.error = error.localizedDescription }
    }
}

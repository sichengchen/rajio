import SwiftUI

struct CatalogPodcast: Decodable, Identifiable {
  let collectionId: Int
  let collectionName: String
  let artistName: String?
  let feedUrl: String?
  let artworkUrl100: String?
  var id: Int { collectionId }
}

struct AddPodcastView: View {
  @ObservedObject var model: LibraryModel
  @Environment(\.dismiss) private var dismiss
  @State private var feedURL = ""
  @State private var task: Task<Void, Never>?
  @FocusState private var focused: Bool
  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 24) {
          Image(systemName: "link.circle.fill").font(.system(size: 52)).foregroundStyle(
            RajioStyle.accent)
          Text("Add by RSS URL").font(.title.bold())
          Text("Add a podcast by RSS feed URL.").foregroundStyle(.secondary)
          TextField("Feed URL", text: $feedURL)
            .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
            .textContentType(.URL).submitLabel(.go).focused($focused).onSubmit(subscribe)
            .accessibilityIdentifier("feed-url")
            .padding(16).background(
              Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
          Button(action: subscribe) {
            HStack {
              Spacer()
              if model.isLoading {
                ProgressView().tint(.white)
              } else {
                Text("Add").font(.headline)
              }
              Spacer()
            }.padding(.vertical, 8)
          }.nativeProminentControl().controlSize(.large)
            .disabled(
              model.isLoading || feedURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
          if let error = model.error { Text(error).font(.subheadline).foregroundStyle(.red) }
        }.padding(28)
      }
      .navigationTitle("Add Podcast").navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") {
            task?.cancel()
            dismiss()
          }
        }
      }
      .onDisappear { task?.cancel() }
    }.tint(RajioStyle.accent)
  }
  private func subscribe() {
    guard !model.isLoading, !feedURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      return
    }
    focused = false
    task?.cancel()
    task = Task { if await model.subscribe(feedURL), !Task.isCancelled { dismiss() } }
  }
}

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
      Form {
        Section {
          TextField("Feed URL", text: $feedURL)
            .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
            .textContentType(.URL).submitLabel(.go).focused($focused).onSubmit(subscribe)
            .accessibilityIdentifier("feed-url")
        } footer: {
          Text("Add a podcast by RSS feed URL.")
        }
        if model.isLoading { ProgressView("Adding podcast…") }
        if let error = model.error {
          Text(error).font(.subheadline).foregroundStyle(.red)
        }
      }
      .navigationTitle("Add Podcast").navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button("Add", action: subscribe)
            .disabled(model.isLoading || feedURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") {
            task?.cancel()
            dismiss()
          }
        }
      }
      .onDisappear { task?.cancel() }
    }.tint(RajioStyle.accent).defaultFocus($focused, true)
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

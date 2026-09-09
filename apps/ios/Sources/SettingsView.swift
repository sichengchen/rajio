import RajioLibrary
import SwiftUI

struct SettingsView: View {
  let database: LibraryDatabase
  @ObservedObject var audio: AudioPlayer
  @EnvironmentObject private var downloads: DownloadManager
  @Environment(\.dismiss) private var dismiss
  @AppStorage("appLanguage", store: L10n.defaults) private var language = "system"
  @AppStorage("appearance", store: L10n.defaults) private var appearance = "system"
  @AppStorage("automaticRefresh", store: L10n.defaults) private var automaticRefresh = true
  @AppStorage("autoPlay", store: L10n.defaults) private var autoPlay = true
  @State private var limit = "2147483648"
  @State private var error: String?
  @State private var clearing = false
  @State private var confirmClear = false

  var body: some View {
    NavigationStack {
      Form {
        Section("Appearance") {
          Picker("Language", selection: $language) {
            Text("Follow System").tag("system")
            ForEach(L10n.languages, id: \.self) { code in
              Text(verbatim: L10n.names[code]!).tag(code)
            }
          }.accessibilityIdentifier("language-picker")
          Picker("Theme", selection: $appearance) {
            Text("Follow System").tag("system")
            Text("Light").tag("light")
            Text("Dark").tag("dark")
          }
        }
        Section("Playback") {
          Picker(
            "Playback speed", selection: Binding(get: { audio.speed }, set: { audio.setSpeed($0) })
          ) {
            ForEach([0.75, 1.0, 1.25, 1.5, 1.75, 2.0], id: \.self) { speed in
              Text(speed.formatted(.number.locale(L10n.locale)) + "×").tag(speed)
            }
          }
          Toggle("Automatically play next episode", isOn: $autoPlay)
        }
        Section {
          Toggle("Automatic refresh", isOn: $automaticRefresh)
        } header: {
          Text("Subscriptions")
        } footer: {
          Text("Podcasts refresh when the app opens and when iOS schedules background updates.")
        }
        Section("Downloads") {
          Picker("Download storage limit", selection: $limit) {
            Text("512 MB").tag("536870912")
            Text("2 GB").tag("2147483648")
            Text("10 GB").tag("10737418240")
            Text("50 GB").tag("53687091200")
          }
          LabeledContent("Storage used") {
            Text(
              ByteCountFormatter.string(
                fromByteCount: downloads.records.values.reduce(0) { $0 + $1.bytes },
                countStyle: .file))
          }
          Button("Remove All Downloads", role: .destructive) { confirmClear = true }.disabled(
            clearing || downloads.records.isEmpty)
          if clearing { ProgressView("Removing downloads…") }
        }
        Section("About") {
          LabeledContent(
            "Version",
            value: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
              ?? "")
          Text("Your library and playback work without an account or a Rajio server.")
            .foregroundStyle(.secondary)
        }
        if let error { Text(error).foregroundStyle(.red) }
      }
      .navigationTitle("Settings")
      .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
      .task {
        do { limit = try await database.preference("downloadLimitBytes") ?? "2147483648" } catch {
          self.error = L10n.error(error)
        }
      }
      .onChange(of: limit) { _, value in
        Task {
          do { try await database.setPreference("downloadLimitBytes", value: value) } catch {
            self.error = L10n.error(error)
          }
        }
      }
      .confirmationDialog(
        "Remove all downloaded audio?", isPresented: $confirmClear, titleVisibility: .visible
      ) {
        Button("Remove All Downloads", role: .destructive) {
          Task {
            clearing = true
            for id in Array(downloads.records.keys) { await downloads.remove(id) }
            clearing = false
          }
        }
        Button("Cancel", role: .cancel) {}
      } message: {
        Text("Subscriptions and listening progress are kept.")
      }
    }
    .environment(\.locale, L10n.locale)
    .preferredColorScheme(appearance == "system" ? nil : (appearance == "dark" ? .dark : .light))
  }
}

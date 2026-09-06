# Rajio Product Roadmap

This roadmap organizes Rajio’s product direction and complete backlog into milestones, outcomes, and dependencies. Independent workstreams proceed concurrently.

Implementation issues and detailed product requirements remain tracked in GitHub Issues. This document provides their shared product context and sequencing.

## Product direction

Rajio is an open-source podcast player whose clients work independently, with optional services for continuity, device control, and content intelligence.

The central product journey is:

**Independent listening on every client → continuous library and listening history → coordinated playback across devices → content understanding and discovery.**

The highest near-term priority is bringing iOS into this journey and making phone-to-desktop continuation reliable. Desktop refinement, localization, performance, accessibility, and self-hosting remain ongoing workstreams throughout the roadmap.

## Product commitments

### Independent clients

Every client supports its core workflow independently of a Rajio backend or account:

- Add subscriptions through RSS, supported catalogs, and OPML.
- Fetch feeds and media directly from their publishers.
- Manage a local library, downloads, playback history, and preferences.
- Play, seek, and save progress locally.
- Browse cached library data and play downloaded episodes without network access.

Local operations remain available during backend outages, session expiration, and disconnected synchronization.

Users can enable synchronization, remote control, server-side transcription, LLM features, and recommendations independently of the core player.

### Self-hosting and multiple users

Self-hosting is the normal deployment model. The backend supports multiple users with isolated data from the outset. Official hosting uses the same core server capabilities and client protocol.

Cloudflare Workers is the primary backend deployment target, including user-owned deployments. Deployment, upgrades, migrations, backup, recovery, and troubleshooting are product responsibilities. Portable deployment follows Cloudflare support.

### Open data and replaceable services

Users can export their subscriptions and personal listening data, change catalog providers, and migrate between servers. Podcast and episode identities remain stable across catalog providers.

Clients share domain semantics and protocol contracts. Platform-specific interfaces and playback implementations provide system integration.

### Localization scope

Desktop and iOS support these seven languages:

| Language | Locale identifier |
| --- | --- |
| Simplified Chinese | `zh-Hans` |
| Traditional Chinese | `zh-Hant` |
| English | `en` |
| Japanese | `ja` |
| French | `fr` |
| Spanish | `es` |
| German | `de` |

Simplified and Traditional Chinese receive separate maintenance and review. Every feature includes all seven languages in its completion criteria.

## Current implementation context

The repository currently contains an Electron desktop client, a backend, and shared contracts. Existing foundations include local SQLite storage, RSS fetching, downloads, direct iTunes catalog search, Media Session integration, optional synchronization, and backend realtime coordination code.

The roadmap adds an iOS application and evolves shared bearer-token authentication into multi-user identity and authorization.

## Technical architecture

| Environment | Application layer | Shared engine | Persistence and coordination |
| --- | --- | --- | --- |
| iOS | SwiftUI | Native Rust library | GRDB / SQLite; platform audio and lifecycle adapters |
| Desktop | Electron / React / TypeScript | Rust compiled to Wasm | SQLite; desktop audio and lifecycle adapters |
| Backend | TypeScript / Hono on Cloudflare Workers; Better Auth | Rust compiled to Wasm | D1 for durable records; Durable Objects for live device coordination |

The shared Rust core owns RSS parsing, podcast and episode models, library rules, synchronization operations, conflict resolution, and playback coordination state transitions. Platform adapters own persistence, transactions, networking, credentials, and audio execution. Electron and Workers share the TypeScript/Wasm binding package.

Clients pass records and operations into the core and persist the resulting changes. Each local mutation and its pending synchronization operation are committed in one database transaction. Schema and migration ownership across persistence adapters is an implementation decision.

### Durable synchronization protocol

Use a server-ordered operation log with domain-specific merge rules. Each operation carries an operation ID, device ID, device sequence, last observed server revision, target identity, and action payload. The server authenticates the user, deduplicates submissions, and assigns accepted revisions. Clients fetch incremental changes using a cursor and replay pending local operations over the updated state.

Rust implements deterministic merge behavior on clients and the server. Hono handles authentication and transport, and D1 persists accepted changes. Validate the transaction strategy for concurrent revision assignment during implementation.

| Data | Merge rule |
| --- | --- |
| Subscriptions | Unsubscribe wins over concurrent updates; an explicit subsequent resubscribe restores the subscription |
| Favorites | Later intentional actions win; server ordering resolves concurrent actions |
| Preferences | Merge independently by field |
| Listening history | Append events and deduplicate by identity |
| Playback progress | Order checkpoints within listening sessions and preserve explicit seek, restart, and completion actions |
| Queue | Merge additions, removals, and moves using stable queue-entry identities |

### Shared queue

Each user has one shared queue, visible and editable on connected devices and carried across playback transfers. Offline edits merge on reconnection.

- Give each addition a unique queue-entry ID, including repeated additions of the same episode.
- Preserve independent additions. Resolve additions at the same position with a deterministic tie-breaker.
- Let removal win over a concurrent move of the same entry.
- Resolve concurrent moves of one entry through accepted server ordering.
- Resolve moves whose anchors have been removed using the nearest surviving anchor and a deterministic fallback.
- Treat clearing the queue as removal of entries observed by that device, preserving concurrent additions from elsewhere.
- Remove a completed entry through an idempotent operation targeting that entry ID.

### Listening progress

Record a listening-session ID, sequence number, explicit user actions, and periodic checkpoints. Checkpoints refer to their session and action sequence so delayed checkpoints preserve newer seeks and restarts.

Preserve competing offline sessions in history and keep active playback stable while merging them. Define the resume-session selection rule before completing C.

### Selected-device playback

Users select where playback occurs. Play, pause, seek, and queue controls on connected clients act on that selected device; clients display its acknowledged playback state. Opening another client preserves the selected destination. Selecting another device initiates an acknowledged transfer.

Durable Objects coordinate the selected device and live session. Commands carry an ID, expiration, and playback-session version. The playback device acknowledges execution and reports actual state. Expire stale commands while retaining durable offline library and queue operations.

When the selected device becomes unreachable, show it as unavailable and offer **Play on this device**. Start local playback when the user chooses that action. Each client also supports independent offline playback.

## Milestone overview

Implementation has started in A and B. The RSS core, native Swift wrapper, TypeScript/Wasm package, and cross-runtime fixture harnesses are implemented. The iOS SwiftUI application now integrates native parsing with GRDB subscriptions, episode browsing, streaming, and persisted progress; see [iOS development notes](../apps/ios/README.md). Library reducers, sync operation types, and persistence contracts are the next A deliverables. Desktop production migration and the remaining independent-client work continue in B. See [shared-core build and test documentation](shared-core.md).

| Milestone | Outcome | Main dependencies |
| --- | --- | --- |
| A — Shared Rust core and independent-operation foundations | Rust domain engine, native and Wasm bindings, and platform adapter contracts | Existing desktop behavior and shared contracts |
| B — Independent iOS and desktop listening | SwiftUI and Electron clients running the shared Rust core, with all seven languages | A native/Wasm packages and persistence contracts |
| C — Multi-user self-hosting and durable synchronization | Hono + Better Auth + Rust/Wasm on Workers, D1 persistence, and shared merge rules | A operation model; B local transactions and outboxes |
| D — Platform quality and distribution | Convenient controls, coherent interfaces, and maintainable installation and updates | Stable client playback and lifecycle behavior |
| E — Realtime device coordination | Rust playback state transitions integrated with Durable Objects and client audio adapters | C identity and device model; shared playback commands |
| F — Transcripts and content understanding | Users can read, find, and navigate spoken content | Stable media and local task handling; C for cloud execution |
| G — Discovery and service ecosystem | Replaceable catalogs, useful recommendations, and optional official hosting | Relevant client, content, and server foundations |

## A — Shared Rust core and independent-operation foundations

### Scope

- Create the shared Rust library for RSS parsing, podcast and episode models, library rules, and synchronization operation types.
- Extract existing TypeScript parsing and library behavior into Rust, preserving behavior through shared fixtures.
- Build a native library with Swift bindings and a Wasm package with TypeScript bindings for Electron and Workers.
- Define the boundary between Rust operations and platform-owned storage, networking, credentials, and audio execution, including errors and serialized records.
- Establish CI builds and matching behavioral tests for native Rust and Wasm; exercise Swift, Electron, and Workers bindings.
- Define podcast and episode identity, including feed changes and media URL changes.
- Define local library, progress, completion, replay, favorite, and preference semantics.
- Establish playback commands and state shared by application views and system controls.
- Specify durable synchronization behavior before connecting multiple clients.
- Keep network synchronization outside the critical path of local reads and writes.
- Validate direct media streaming as the default; downloaded media takes precedence when available.
- Establish startup, navigation, library-size, memory, and playback performance baselines.
- Establish shared design rules and internationalization infrastructure.
- Fix show-notes hyperlink underlines and inconsistent upper/lower border visibility on list hover.
- Begin an iOS vertical prototype covering feed ingestion, local persistence, playback, downloading, lock-screen use, interruption recovery, and progress persistence.

### Completion criteria

- Native and Wasm builds produce the same domain results for shared RSS, identity, and library fixtures.
- Swift, Electron, and Cloudflare Workers each invoke the Rust core through a working integration harness.
- Rust returns changes that platform persistence adapters can apply atomically with pending sync operations.
- Startup, library use, and local playback work with the backend disconnected.
- Restarting the application restores persisted listening state correctly.
- Media validation covers redirects, range requests, seeking in long episodes, connection loss, private feeds, and unavailable media URLs.
- Performance measurements are repeatable against defined devices and library sizes.
- Shared contracts cover the states needed by independent clients and later synchronization.

### Implementation choices

Select Swift binding tooling, Wasm packaging, and persistence schema/migration ownership. SwiftUI, Rust, GRDB, and Wasm are the selected architecture. Validate background audio, downloads, and system integration through the iOS playback prototype.

## B — Independent iOS and desktop listening

### Scope

- Connect SwiftUI to the native Rust core and implement GRDB persistence adapters.
- Migrate Electron RSS parsing and library rules to the Rust/Wasm package, replacing the corresponding TypeScript implementations.
- Implement desktop SQLite and iOS GRDB transactions that save domain changes and outbox operations together.
- Run shared integration fixtures against both persistence adapters and verify migration of existing desktop data.
- Deliver an iOS client with local subscriptions, catalog and RSS entry points, OPML support, library browsing, downloads, playback, and progress persistence.
- Integrate background playback, lock-screen controls, audio interruptions, and output-route changes on iOS.
- Complete desktop background playback, including continued playback after closing the main window and an explicit application quit action.
- Automatically refresh subscriptions on appropriate lifecycle events and background opportunities.
- Use cache validation, bounded concurrency, retry/backoff, and visible refresh status.
- Hide the sidebar refresh button while retaining an accessible manual refresh action elsewhere.
- Keep only the back action visible while scrolling, labeled with the originating page title.
- Bring settings and onboarding into the shared design system, including loading, empty, error, focus, and disabled states.
- Deliver all seven supported languages across core screens, settings, onboarding, menus, errors, and status messages.
- Address download failures, missing files, recovery, storage limits, and cleanup behavior.

### Completion criteria

- Both clients use the shared Rust implementation for RSS parsing, episode identity, and library rules.
- GRDB and desktop SQLite persist equivalent outcomes for shared fixtures; crash recovery preserves local mutations and pending operations together.
- Each client can independently complete subscription, refresh, download, offline playback, and progress restoration without server configuration.
- Playback recovery preserves the user’s play or pause intent.
- Refresh failures are understandable and recoverable. Background refresh uses each platform’s scheduling mechanisms.
- Language detection, manual selection, fallback, pluralization, dates, numbers, and durations work consistently.
- All seven languages receive layout and font-fallback checks. Changing language updates the interface completely.

## C — Multi-user self-hosting and durable synchronization

### Identity and isolation

- Replace the shared-token identity model with per-user authentication and authorization.
- Associate each device with a user and an independently revocable session.
- Use Better Auth within Hono for authentication and sessions.
- Provide an admin dashboard for creating and managing users on private servers. Keep public registration disabled.
- Apply user isolation to storage, HTTP APIs, realtime connections, and future background jobs.
- Provide secure credential handling, session expiration, device inspection, and revocation.

### Durable synchronization

- Implement the operation reducer, queue merge rules, progress ordering, and conflict resolution in the Rust core.
- Integrate the Rust/Wasm reducer into Hono on Workers and replace the corresponding server-side TypeScript domain rules.
- Implement D1 storage for deduplicated operations, accepted revisions, and incremental cursors, with transactional concurrent-write handling.
- Integrate native Rust sync operations with the iOS outbox and Rust/Wasm sync operations with the desktop outbox.
- Run shared convergence fixtures across native clients and the Workers Wasm build, covering duplicates, reordered delivery, deletion, queue conflicts, and offline reconnection.
- Synchronize subscriptions, playback checkpoints, history, completion state, favorites, the playback queue, and explicitly designated playback preferences.
- Keep device-specific settings, downloaded file paths, and platform permissions local.
- Save locally first, then synchronize through retryable, idempotent operations.
- Define merge behavior for deletion, replay, seeking backward, concurrent edits, and devices reconnecting after extended offline use.
- Resolve progress using listening actions and their ordering, including replay and backward seeking.
- Trigger synchronization at playback and application lifecycle boundaries.
- Check for newer listening state when continuing on another device, with a bounded wait and local playback fallback.
- Make connection state, failures, and pending synchronization understandable to users.

### Account and server lifecycle

- Support optional server configuration and login from client settings.
- Define logout, account switching, and server migration behavior, including local data retention and explicit merge choices.
- Scope local data and uploads to the selected account.
- Support portable export and recovery of subscriptions, library state, and listening history.

### Self-hosting delivery

- Deliver user-owned Cloudflare deployments using Workers, D1, and Durable Objects.
- Document persistent storage, configuration, TLS/reverse-proxy setup, health checks, and troubleshooting.
- Provide database migrations, upgrade procedures, backup and restore procedures, and a client/server compatibility policy.
- Validate restore and upgrade behavior using realistic multi-user data.
- Select the deployment entry point during implementation. Develop portable deployment after the Cloudflare path.

### Completion criteria

- Clients and Workers apply the same Rust merge implementation and converge after receiving the same accepted operations.
- Retried operations are idempotent, cursors resume correctly, and concurrent D1 writes preserve revision ordering.
- Phone-to-desktop and desktop-to-phone continuation work reliably.
- Synchronization preserves newer intentional listening actions when older devices reconnect.
- Data access and playback control are isolated per user.
- An independent operator can deploy, upgrade, back up, and restore the service using the documentation.
- Disconnecting the server or signing out preserves independent client operation according to the documented data-retention behavior.

## D — Platform quality and distribution

### Desktop controls and visual quality

- Add macOS application menu commands and configurable keyboard bindings, including conflict handling.
- Validate and complete system Now Playing and media-key integration.
- Add menu-bar controls and a menu-bar player.
- Add a floating miniplayer, with all windows and control surfaces using the same playback state and command path.
- Create layered application icons and dark appearances; validate platform packaging and fallback assets.
- Complete design-system coverage, keyboard navigation, accessibility labeling, and contrast checks.
- Review all seven languages for translation quality and text expansion across platforms.

### Installation and updates

- Package native Rust artifacts with iOS builds and the Rust/Wasm package with Electron releases; version bindings and verify compatibility during upgrades.
- Deliver version detection, update availability and progress UI, signed installation, and a clear restart/apply flow.
- Verify upgrades preserve local data and recover appropriately from failed downloads or installation.
- Evaluate incremental downloads by platform and distribution channel.
- Evaluate runtime hot updates by platform and distribution channel, including installation and recovery behavior.
- Publish release notes and compatibility information.

### Website and documentation

- Provide a website with product capabilities, supported platforms, downloads, release history, and independent-operation expectations.
- Publish user help, privacy information, and self-hosting documentation.
- Localize the website, installation/update copy, and essential user journeys into the same seven languages.

### Completion criteria

- System controls, application menus, menu-bar player, and miniplayer accurately control the same playback session.
- Playback continues in the same session as auxiliary views open and close.
- Users can install, update, and troubleshoot the application without developer assistance.
- UI, localization, and accessibility checks cover every supported control surface.

## E — Realtime device coordination

### Scope

- Implement selected-device, transfer, acknowledgement, and command-expiration state transitions in Rust.
- Run those transitions through Wasm in the Durable Object coordinator, with authenticated per-user device sessions.
- Connect native iOS and Electron/Wasm command handling to platform audio adapters and report actual execution state.
- Show devices with meaningful online, unavailable, active, and controllable states.
- Support remote play, pause, seek, and applicable playback controls.
- Reflect the active device's playback state and progress on controlling clients.
- Transfer playback between devices through an acknowledged handoff.
- Define playback ownership, simultaneous command handling, command expiration, and reconnection behavior.
- Show the destination as active after transfer confirmation and display failures explicitly.
- Apply session authorization and device revocation to control operations.

Deliver Rajio-to-Rajio playback handoff with one active playback device and synchronized controls. Evaluate Apple system Handoff as a platform integration.

### Completion criteria

- Shared state-transition fixtures pass in native Rust and Wasm, including transfer failure, stale commands, and reconnection.
- An unavailable selected device offers **Play on this device**; local playback starts when the user chooses it.
- Users can identify where audio is playing and deliberately change that device.
- Commands report success or failure and expire before becoming stale.
- Device loss and server outages leave local playback usable.
- Device availability tracks connection status and platform lifecycle state.

## F — Transcripts and content understanding

### Sequence and scope

1. Consume publisher-provided transcripts and expose their provenance.
2. Display a transcript timeline with current-position tracking and click-to-seek navigation.
3. Add transcript search and useful local indexing.
4. Add client-side transcription, beginning with desktop evaluation and extending to iOS after resource testing.
5. Add optional server-side transcription using the same result format.
6. Add optional LLM-assisted summaries, chapters, and questions answered with references to the relevant audio positions.

Local transcription includes model acquisition, storage management, progress, cancellation, and resource controls. Transcription runs locally using downloaded models and audio.

Server-side transcription includes per-user job ownership, scheduling, cancellation, provider configuration, quotas, and result lifecycle management. Show the processing destination when users submit audio or text.

### Completion criteria

- Transcripts preserve source, language, and timing information; generated material is distinguishable from publisher material.
- Timeline accuracy is evaluated separately from transcription accuracy, including long episodes and mixed-language speech.
- Desktop and iOS processing are measured for memory, battery, thermal behavior, and foreground responsiveness.
- Cloud and local results can be consumed by the same reader and navigation experience.
- LLM features help users perform concrete listening tasks and lead back to source audio.

Evaluate and publish recognition and translation quality by language.

## G — Discovery and service ecosystem

### Catalogs and recommendations

- Preserve direct iTunes search and RSS/OPML entry points.
- Add replaceable catalog providers, evaluating coverage, search relevance, deduplication, feed availability, authentication, and operating cost.
- Store provider secrets in backend adapters or user-managed configuration.
- Keep subscribed feeds usable independently of the catalog that discovered them.
- Develop recommendations around explicit outcomes such as finding a new show or selecting the next episode.
- Add user feedback and controls over whether listening history influences recommendations.
- Provide a recommendation toggle independent of core library functionality.

### Official hosting

- Build official hosting on the established multi-user, self-hostable service.
- Add public-service operations as needed: registration, email delivery, abuse controls, quotas, observability, and potential billing.
- Keep hosted operational dependencies optional for self-hosters.
- Maintain protocol compatibility and a documented path to export or migrate away from official hosting.

### Completion criteria

- Subscriptions and local episode identities remain stable when catalog adapters change.
- Evaluate recommendation value through user feedback.
- Core clients and self-hosted deployments operate independently of official hosting.

## Cross-cutting performance and quality

Measure and improve the following throughout A–G:

| Area | Coverage |
| --- | --- |
| Startup | Cold and warm launch, first usable content, image loading, offline startup |
| Navigation | First entry to each screen, repeated navigation, long lists |
| Library scale | Large subscription and episode counts, queries, indexing, artwork caches |
| Playback | Start latency, seeking, interruptions, background CPU and memory |
| Downloads | Concurrency, recovery, disk use, foreground responsiveness |
| Synchronization | Large backlogs, retries, conflict handling, server failure |
| Transcription | Throughput, memory, energy use, thermal impact, cancellation |
| Server operation | Multi-user isolation, resource use, migrations, backup and restore |

Set numerical budgets after representative baselines are established. Optimize measured bottlenecks before choosing implementation-language changes. Use Rust and native modules for workloads with measurable performance benefits.

## Sequencing and decision gates

- **Primary dependency chain: A → B → C → E.** Build the Rust core and bindings, integrate both clients, deploy the same sync rules on Workers, then add shared playback coordination through Durable Objects.
- Backend identity and deployment work in C can proceed alongside B once A's contracts are established.
- D begins as client foundations stabilize and proceeds alongside iOS and synchronization work.
- F's local capabilities can proceed once playback, media handling, and local task management are stable. Cloud execution additionally depends on C.
- G's catalog improvements can proceed earlier. Recommendations depend on a defined user outcome and feedback; official hosting depends on mature self-hosting operations.

Resolve these implementation decisions using the listed evidence:

| Decision | Evidence needed | Required before |
| --- | --- | --- |
| Swift/Rust bindings and persistence schema ownership | Cross-platform build, transaction tests, migration ownership | Completion of B |
| Cloudflare deployment entry point | Owner setup experience and upgrade workflow | Self-hosting delivery in C |
| Better Auth login and recovery configuration | Private-server administration and device-session requirements | Multi-user operation in C |
| Competing offline sessions and queue ordering details | Concurrent-operation fixtures and convergence tests | Synchronization completion in C |
| Portable server storage and runtime | Deployment simplicity, migration path, expected scale | Portable deployment after Cloudflare support |
| Additional native performance modules | Profiling evidence and measurable benefit | Workload-specific optimization |
| Transcription engines and model defaults | Accuracy, timeline quality, device resources, model distribution | Transcription delivery in F |
| Incremental and runtime update mechanisms | Platform support, channel constraints, failure recovery | Corresponding update capabilities in D |

## Original backlog coverage

| Backlog item | Roadmap placement |
| --- | --- |
| Show-notes hyperlink underline bug | A |
| Inconsistent list-hover upper/lower borders | A |
| Persistent back action and collapsing page header | B |
| Settings/onboarding and design-system consistency | A foundations; B migration; D quality review |
| Automatic subscription refresh; hide sidebar refresh | B |
| Layered application icon | D |
| Dark-mode application icon | D |
| macOS menu controls | D |
| Keyboard bindings | D |
| Desktop background playback | A lifecycle validation; B completion |
| macOS menu-bar player | D |
| Miniplayer | D |
| iTunes and alternative catalogs; optional backend adapters | B baseline; G expansion |
| Streaming investigation: proxy versus direct RSS media | A; direct delivery remains the default |
| Cold/warm startup, screen loading, Rust investigation | A baselines; continuous optimization |
| Shared Rust core and native/Wasm bindings | A implementation and build pipeline; B client migration; C server sync integration; E playback coordination |
| iOS client | A prototype; B independent client; C/E cross-device capabilities |
| Seven-language support | A infrastructure; B complete client coverage; D website and quality review; all later features |
| Authentication | C; G hosted-service operations |
| Cross-device library and progress synchronization | C |
| Realtime synchronization, handoff, remote device control | E |
| Backend LLM integration | F |
| Backend transcription | F |
| Client transcription with timeline | F |
| Backend recommendations | G |
| Update detection, hot updates, incremental updates | D, with platform-specific feasibility decisions |
| Website | D; expanded for self-hosting and official services as those capabilities arrive |

## Research references

References for platform integration, media delivery, synchronization, and content processing:

- [Apple podcast RSS requirements](https://podcasters.apple.com/support/823-podcast-requirements): media delivery and byte-range support.
- [Apple background execution modes](https://developer.apple.com/documentation/Xcode/configuring-background-execution-modes) and [background strategies](https://developer.apple.com/documentation/backgroundtasks/choosing-background-strategies-for-your-app): mobile execution constraints.
- [Pocket Casts synchronization](https://support.pocketcasts.com/knowledge-base/pocket-casts-sync/) and [Spotify Connect](https://support.spotify.com/us/article/spotify-connect/): durable continuation versus remote playback control.
- [Electron Tray](https://www.electronjs.org/docs/latest/api/tray/) and [globalShortcut](https://www.electronjs.org/docs/latest/api/global-shortcut/): desktop controls.
- [Apple Icon Composer](https://developer.apple.com/icon-composer/): layered icons and appearance variants.
- [electron-builder auto update](https://www.electron.build/docs/features/auto-update/): packaging and update requirements.
- [Podcast namespace](https://github.com/Podcastindex-org/podcast-namespace/blob/main/docs/1.0.md) and [whisper.cpp](https://github.com/ggml-org/whisper.cpp): transcript interchange and local transcription candidates.
- [iTunes Search API](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/Searching.html) and [Podcast Index examples](https://github.com/Podcastindex-org/example-code/blob/master/README.md): catalog integration references.

# Hanoki (Desktop) — Implementation Plan

Task tracking lives in `docs/TASKS.md`.

## Current stack (repo)

- Desktop shell: Electron Forge (Electron main process + renderer webview)
- Renderer: React + Vite
- Navigation: TanStack Router
- Styling: Tailwind CSS v4 (+ existing UI primitives)
- Client state: Zustand
- Tooling: TypeScript, OXC lint/format
- Persistence:
  - Global: `config.toml` (TOML file, no secrets) — implemented in `src/main-process/config/`
  - Global session: `session.json` for UI session state (tabs/panes/route, no secrets)
  - Workspace: SQLite (`better-sqlite3`) + Drizzle ORM + `drizzle-kit` migrations
    - Query style: `select().from().leftJoin().where()...` (avoid `db.query.*`)
    - Runtime: apply migrations on workspace open / app start

## Guiding principles

- Local-first: everything works offline where possible; cloud providers optional.
- AI SDK as the contract: store `message.parts` compatibly.
- Branching-first: message tree is core behavior.
- Main/renderer split: secrets + network + DB in main process.
- IPC for live updates: stream state over Electron IPC events, not DB polling.
- SQLite for durable state: persist final chat content and checkpoint snapshots.
- Router owns page navigation; Zustand owns UI/session state inside pages.
- Session persistence is main-process owned; renderer never writes session to `localStorage`.

## Proposed architecture (high level)

Main process (Electron, `src/main-process/…`)

- Persistence (SQLite)
- Provider registry + model discovery
- AI execution via Vercel AI SDK (streaming, tools, structured output, image/video)
- Runtime stream manager (in-memory per-chat stream state)
- Extension host (register tools/commands)
- Secret manager (Keychain integration)

Renderer (React, `src/mainview/…`)

- Workspace + chat + folder navigation
- TanStack Router route tree for `/chat` and `/settings/*`
- Tabbed chat UI with per-tab streaming indicators
- Prompt composer and attachments picker
- Settings pages (app + providers + prompts + extensions)
- Zustand stores:
  - durable app/workspace/chat state
  - live stream/tab indicator state
  - tab/pane layout state

Typed IPC bridge (Electron)

- Renderer -> main: request/command RPC (`startStream`, `cancelStream`, CRUD)
- Main -> renderer: stream events (`started`, `delta`, `completed`, `failed`, `canceled`)
- Renderer -> main: session RPC (`getWorkspaceSession`, `saveWorkspaceSessionPatch`)

## Navigation and session model

Route scope (TanStack Router):

- `/chat`
- `/settings`
- `/settings/providers`
- `/settings/appearance`

Ownership:

- Router: visible top-level page and settings sub-page history.
- Zustand: active pane, open tabs, active tab per pane, sidebar/modals.

Session persistence:

- Session state persisted in main process `session.json`, keyed by `workspaceId`.
- Session includes panes, tabs, active pane, recent tabs, and last route.
- Renderer hydrates store from `getWorkspaceSession` during workspace load.
- Renderer sends debounced session patches through RPC.
- Main validates session chat IDs against app DB before hydrate.

## Streaming model

- One active stream per chat in v1.
- Main process keeps `Map<chatId, StreamState>` in memory.
- Stream chunks are emitted to renderer as IPC events.
- Renderer updates Zustand live state immediately.
- Final assistant message is persisted to `messages` on completion.
- Stream partial can be checkpointed to DB on minute interval, tool-call boundaries, and failure paths.
- Notification is emitted when a stream completes for a non-active tab.
- `startStream` must return an `already_streaming` error if the chat already has an active stream.

### Event contract (v1)

- `chat.stream.started` `{ chatId, requestId }`
- `chat.stream.delta` `{ chatId, requestId, textDelta }`
- `chat.stream.completed` `{ chatId, requestId, messageId, finishedAt }`
- `chat.stream.failed` `{ chatId, requestId, error }`
- `chat.stream.canceled` `{ chatId, requestId }`
- `chat.stream.checkpointed` `{ chatId, requestId, updatedAt }` (optional UI signal)

### Performance constraints (v1)

- Single renderer event channel; route updates by `chatId`.
- Active chat keeps full partial text.
- Inactive chats keep minimal live state (`status`, `lastDeltaAt`, `hasUnreadCompletion`).
- Throttle inactive tab updates if needed.
- No DB writes per token; persist by checkpoint policy (time-based + tool boundaries + failure + completion).

## Data model (v1)

We keep content in `messages.parts` (JSON serialized string) and put queryable stable metadata in columns.

Global config (`config.toml`)

- app settings (theme, behavior, window state)
- active workspace id + app-level preferences
- extension enablement + global extension settings (optional)

Global session (`session.json`)

- workspace session map keyed by `workspaceId`
- per-workspace tab/pane layout state
- per-workspace recent tabs
- last route (`/chat` or `/settings/*`)

App DB (single SQLite file)

- `workspaces` (workspace metadata + settings JSON)
- `workspace_provider_overrides` (per-workspace provider enable/disable)
- `workspace_model_overrides` (per-workspace model enable/disable)

- `folders` (nested, for chats; workspace-scoped)
- `chats` (workspace-scoped)
- `messages`
- `assets` (files/images/video references; workspace-scoped files on disk)
- `providers` (app-global configured AI provider profiles)
- `models` (app-global model entries, FK to provider)
- `chat_settings` (per-chat model, system prompt, structured output mode)

Messages table (minimum fields)

- `id` (UUIDv7)
- `chat_id`
- `parent_id` (nullable; root message has NULL)
- `role` (`system`/`user`/`assistant`/`tool`)
- `parts` (TEXT; JSON)
- `metadata` (TEXT JSON; stable run summary only)
- `created_at`, `updated_at`

`messages.metadata` stores execution summary

- `providerId`, `modelId`
- `tokensPrompt`, `tokensCompletion`, `tokensTotal`
- `latencyMs`
- `finishReason`
- `error` (if failed)
- checkpoint markers (`checkpointAt`, optional `checkpointReason`)

Not in DB

- live token-by-token event log
- per-tab loading indicators
- renderer-only UI flags

## Branch mechanics

- Branching uses adjacency lists:
  - multiple assistant replies can share the same `parent_id`
  - editing creates a new node, no mutation
- For UX/perf:
  - store per-chat selected leaf id (or dedicated table)
  - compute active branch path via recursive query

## Milestones

### M0 — Foundations (1–2 days)

- Finalize naming and workspace storage layout.
- Finalize IPC event contracts and shared RPC types.
- Finalize Zustand store boundaries (durable state vs live stream state).
- Scaffold TanStack Router route tree for top-level pages.
- Define global session schema and session RPC contract.

### M1 — Storage + workspace/chats/folders (2–4 days)

- SQLite schema + migrations in place.
- CRUD for workspaces, folders, chats.
- Basic renderer shell for workspace switcher + folder/chat list.

Deliverable: user can create a workspace and organize chats with persistence.

### M2 — Message tree + tabbed chat UI (3–6 days)

- Implement message CRUD with `parent_id`.
- Tabbed chat layout.
- Session hydrate/restore for tabs and active pane.
- Linear active-branch rendering + branch selector at forks.
- Composer submit creates `user` message node.

Deliverable: branching chats are navigable in tabs.

### M3 — Providers + model discovery (3–6 days)

- Provider profiles in app DB (global).
- Model discovery and per-workspace model enable/disable via overrides.
- Settings UI for provider profiles and defaults.

Deliverable: user can configure global providers/models and workspace-specific enablement.

### M4 — AI streaming runs (4–8 days)

- Implement main-process stream pipeline with AI SDK `streamText`.
- Forward stream events to renderer through Electron IPC.
- Persist final assistant message + final metadata in `messages.metadata`.
- Persist partial checkpoints on timer/tool-call/failure boundaries.
- Reject concurrent start for same chat with `already_streaming` error.
- Support cancel flow.

Deliverable: live streaming in chat, per-tab loading indicators, completion notifications.

### M5 — Images (3–6 days)

- Add image generation and asset persistence.
- Add image parts into chat messages.
- Render inline images in chat.

Deliverable: image generation is usable in chat.

### M6 — Structured outputs (2–5 days)

- Per-chat structured output mode + schema.
- Persist parsed structured result in message metadata/parts.
- JSON viewer in UI.

Deliverable: schema-driven responses in a chat.

### M7 — Extensions MVP (4–10 days)

- Extension registry + manifest format.
- Extension host registers tools/commands.
- Settings UI for enable/disable and capabilities.

Deliverable: third-party extensions can add tools/commands.

### M8 — Video (experimental)

- Timeboxed spike behind feature flag.
- Store video assets + inline preview.

Deliverable: decide ship/no-ship after prototype.

## Decisions

- Workspace-first UX with a single app SQLite DB and per-workspace asset directories.
- `message.parts` is canonical content format.
- Streaming is IPC-driven with in-memory runtime state.
- Zustand is the default state management layer in renderer.
- TanStack Router is the navigation layer for top-level pages.
- Hash history (`createHashHistory`) used for desktop renderer compatibility.
- File-based routing via `@tanstack/router-plugin`; `routeTree.gen.ts` is gitignored.
- Feature modules live in `src/mainview/features/`; route files in `src/mainview/routes/` are thin wrappers.
- Tabs/panes/recent-tabs are persisted in main-process `session.json` keyed by workspace.
- No `message_runs` table; `messages` + runtime stream state is the model.
- Partial stream checkpoints are persisted in `messages` by policy; no per-token persistence.
- `startStream` is single-flight per chat and returns `already_streaming` on conflict.
- Provider schema uses `authKind` + Keychain refs + `config` JSON.

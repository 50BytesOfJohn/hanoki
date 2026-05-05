# Hanoki — Tasks (repo tracker)

## Status tags

- `BACKLOG` — good idea, not scheduled
- `NEXT` — queued up
- `IN_PROGRESS` — actively being built
- `BLOCKED` — waiting on a decision/spike
- `DONE` — shipped/merged

## How to use

- Each ticket is a small, mergeable slice (ideally <=1–2 days).
- Prefer adding Acceptance bullets (binary done/not done).
- Keep dependencies explicit.

## M0 — Foundations

### M0-T1 — Workspace on-disk spec

- Status: `NEXT`
- Goal: Define workspace folder layout (DB + assets) and export/backup story.
- Acceptance:
  - Single documented layout under `Utils.paths.userData`
  - Workspace export is copying one folder (no secrets)

### M0-T2 — Global config file (`config.toml`)

- Status: `DONE`
- Goal: Define and implement a global TOML config file with typed access.
- Acceptance:
  - Config loads on app start; missing file falls back to defaults
  - `getConfig()` / `updateConfig(patch)` / `reloadConfig()` API
  - Current fields: `app.theme`, `chat.message.fontSize`
  - No secrets stored

### M0-T3 — ID + time conventions

- Status: `NEXT`
- Goal: Standardize IDs + timestamps.
- Acceptance:
  - IDs: UUIDv7 everywhere
  - Timestamps: UTC ms epoch

### M0-T4 — DB stack decision + scaffolding (Drizzle + better-sqlite3)

- Status: `DONE`
- Goal: Establish app DB access pattern and migrations workflow.
- Acceptance:
  - `drizzle.config.ts` present and runnable via pnpm scripts
  - Migration runs against local app DB

### M0-T5 — Spike: Keychain `SecretStore`

- Status: `BLOCKED`
- Goal: Pick best macOS Keychain integration path for Electron.
- Acceptance:
  - `SecretStore` API shape agreed (`get/set/delete/list`)
  - Recommended implementation path selected

### M0-T6 — Shared RPC schema for app IPC

- Status: `NEXT`
- Goal: Define shared Electron IPC request/message types for chat + streaming.
- Acceptance:
  - Shared RPC type file exists
  - Includes start/cancel stream requests
  - Includes stream started/delta/completed/failed/canceled messages

### M0-T7 — Renderer state architecture (Zustand)

- Status: `NEXT`
- Goal: Settle store boundaries and slices.
- Acceptance:
  - `chatStore` for durable chat/message state
  - `streamStore` for live streaming/tab indicators
  - `uiSessionStore` for tabs/panes/sidebar/modals
  - Selector pattern documented and used

### M0-T8 — TanStack Router scaffold

- Status: `DONE`
- Goal: Add route tree for top-level pages and settings sub-navigation.
- Acceptance:
  - TanStack Router installed and bootstrapped in renderer
  - Routes include `/chat` and `/settings/*`
  - Settings sections are routed pages

### M0-T9 — Global session persistence service (main process)

- Status: `NEXT`
- Goal: Persist workspace UI session state outside renderer storage.
- Acceptance:
  - `session.json` file managed by Electron main process
  - Session keyed by `workspaceId`
  - Stores panes/tabs/active pane/recent tabs/last route
  - No `localStorage` usage for workspace session persistence

### M0-T10 — Session RPC contract

- Status: `NEXT`
- Goal: Add typed RPC requests for loading/saving workspace session state.
- Acceptance:
  - `getWorkspaceSession(workspaceId)` request implemented
  - `saveWorkspaceSessionPatch(workspaceId, patch)` request implemented
  - Main validates and writes debounced session updates

## M1 — App DB + workspace storage

### M1-T1 — App DB migrations runner (Drizzle)

- Status: `NEXT`
- Goal: Apply migrations on app start for the single app DB.
- Acceptance:
  - Migrations table used consistently
  - Idempotent open/create app DB
  - Packaged app can find and apply migration files

### M1-T2 — Schema v1: folders/chats/messages/assets/providers/models/settings

- Status: `IN_PROGRESS`
- Goal: Create initial schema aligned with message tree + AI SDK parts + provider profiles.
- Acceptance:
  - `messages(parent_id)` supports branching
  - `messages.parts` is TEXT JSON
  - `providers` has `authKind`, `apiKeyId`, `apiSecretId`, `config`
  - `models` FK to `providers`
  - Drizzle migration generated and applied

### M1-T3 — Workspace CRUD in main process

- Status: `BACKLOG`
- Goal: Create/open/list/delete workspaces and manage paths.
- Acceptance:
  - Create workspace creates DB row + workspace folder + `assets/`
  - Workspace metadata (name/settings) is read from app DB `workspaces` table

## M2 — Chat UI (no AI)

### M2-T1 — Sidebar: folders + chats

- Status: `BACKLOG`
- Acceptance:
  - Create/rename/delete folder and chat
  - Move chats between folders (nested)

### M2-T2 — Tabbed chat shell + branch view

- Status: `BACKLOG`
- Acceptance:
  - Tab strip with open chats
  - Tabs restored from persisted workspace session
  - Active branch renders as linear list
  - Fork points show branch selector

### M2-T3 — Composer v1

- Status: `BACKLOG`
- Acceptance:
  - Submit creates `user` message node with text part

## M3 — Providers (workspace-only)

### M3-T1 — Provider profiles table + UI

- Status: `BACKLOG`
- Acceptance:
  - Add/edit/remove provider profiles
  - Supports Ollama (`authKind: none`) and OpenRouter (`authKind: api_key`)
  - Form fields driven by `authKind` + provider kind
  - Secrets stored as Keychain references only

### M3-T2 — Model discovery + enable/disable models

- Status: `BACKLOG`
- Acceptance:
  - Fetch models list per provider profile
  - Persist enabled set for model picker

## M4 — AI streaming

### M4-T1 — Main-process stream manager

- Status: `BACKLOG`
- Goal: In-memory runtime stream state keyed by `chatId`.
- Acceptance:
  - Tracks status, requestId, startedAt, partial text
  - One active stream per chat in v1
  - `startChatStream` returns `already_streaming` error if chat already has an active stream
  - Cancel supported

### M4-T2 — Stream forwarding over Electron IPC

- Status: `BACKLOG`
- Acceptance:
  - `streamText` deltas emitted to renderer in real time
  - Started/completed/failed/canceled events emitted
  - Renderer receives updates by `chatId`

### M4-T3 — Persist final assistant message

- Status: `BACKLOG`
- Acceptance:
  - Final assistant response stored in `messages.parts`
  - Final metadata stored in `messages.metadata`
  - No per-token DB writes

### M4-T4 — Partial checkpoint persistence policy

- Status: `BACKLOG`
- Acceptance:
  - Partial assistant content checkpoint persisted at least once per minute while streaming
  - Partial checkpoint persisted on tool-call boundaries
  - Partial checkpoint persisted on failure paths
  - Checkpoint metadata records reason/timestamp

### M4-T5 — Tab indicators + completion notifications

- Status: `BACKLOG`
- Acceptance:
  - Streaming tab shows loading indicator
  - Background completion marks tab unread/completed
  - Background completion triggers desktop notification

### M4-T6 — Streaming performance guardrails

- Status: `BACKLOG`
- Acceptance:
  - Inactive chats keep minimal live state
  - Optional throttling/coalescing for inactive chat deltas
  - Scoped selectors avoid global rerenders

## M5 — Images

### M5-T1 — Image generation + asset persistence

- Status: `BACKLOG`
- Acceptance:
  - Generates image and stores under `assets/`
  - Adds image part to chat message

### M5-T2 — Media gallery view

- Status: `BACKLOG`

## M6 — Structured outputs

### M6-T1 — Per-chat JSON schema setting

- Status: `BACKLOG`

### M6-T2 — Persist parsed JSON result

- Status: `BACKLOG`

## M7 — Extensions (MVP)

### M7-T1 — Extension registry + workspace settings

- Status: `BACKLOG`

### M7-T2 — Extensions as tools/commands host

- Status: `BACKLOG`

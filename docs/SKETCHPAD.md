# Hanoki (Desktop) — Sketchpad

Concrete execution details live in `docs/PLAN.md`.

## Product snapshot

What we are building:

- Desktop AI chat app
- Multi-provider LLM chat (cloud + local, starting with Ollama)
- Tabbed chat experience
- Tool usage (first-party + extension-provided)
- Image generation in-chat

Contract layer:

- Vercel AI SDK for provider adapters, streaming, tools, and `message.parts`

Core workflow:

- User has workspaces
- Workspace contains nested folders and chats
- Each chat is a message tree (`parentId` adjacency)

## Core architecture notes

Main process (Electron):

- DB access
- AI SDK calls
- Runtime stream manager
- Secret/keychain access
- RPC handlers
- Global session persistence (`session.json`)

Renderer (React):

- UI rendering
- TanStack Router
- Zustand stores
- RPC client
- Tab state and notifications

IPC:

- Electron IPC is the live update channel
- Main pushes stream deltas/events to renderer
- Renderer does not poll DB for token updates

## State model

Durable state (SQLite):

- folders
- chats
- messages
- assets
- providers
- models
- chat_settings

Global session state (main-managed JSON):

- workspace route state
- pane tree
- open tabs per pane
- active tab per pane
- recent tabs

Live state (in memory):

- active streaming request per chat
- token deltas
- per-tab loading indicator
- per-tab unread completion marker

Renderer store split:

- `chatStore`: durable chat/message view model
- `streamStore`: live stream + tab indicators + completion state
- `uiSessionStore`: pane layout, tab state, sidebar, modals

## Navigation model

Router:

- TanStack Router handles top-level app pages and settings sub-routes.
- Route set: `/chat`, `/settings`, `/settings/providers`, `/settings/appearance`.

Store:

- Tabs and panes are not encoded in route path.
- Active route is persisted in workspace session state and restored on workspace open.
- Session save/load goes through main-process RPC, not `localStorage`.

## Streaming model (v1)

- One active stream per chat.
- Main keeps `Map<chatId, StreamState>`.
- New start request for a streaming chat returns `already_streaming`.
- Stream events are emitted via RPC.
- Active chat accumulates full partial text.
- Inactive chats keep minimal live state.
- Partial content can be checkpointed to DB on timer, tool boundaries, and failure paths.
- On completion, final assistant content is persisted to `messages.parts`.

RPC event shape (v1):

- `chat.stream.started`
- `chat.stream.delta`
- `chat.stream.completed`
- `chat.stream.failed`
- `chat.stream.canceled`
- `chat.stream.checkpointed` (optional UI signal)

Notification behavior:

- If completion occurs in non-active tab, raise desktop notification and mark tab unread/completed.

## Message model notes

Canonical content:

- `messages.parts` (TEXT JSON)

Branching:

- Tree via `parentId`
- Multiple assistant children allowed

Metadata:

- `messages.metadata` stores execution summary:
  - provider/model
  - token totals
  - latency
  - finish reason
  - error
  - checkpoint timestamp/reason

Non-goals for message persistence:

- no token-by-token DB writes
- no dedicated run history table

## Storage layout

App DB:

- `app.sqlite`

Per-workspace layout:

- `assets/<assetId>.<ext>`
- optional thumbnails cache

Global config:

- `config.toml` for app-level settings (workspace list/settings live in DB)

## Providers

Initial targets:

- Ollama (`authKind: none`)
- OpenRouter (`authKind: api_key`)

Provider profile fields:

- `id`, `displayName`, `kind`
- `authKind`
- `baseUrl`
- `apiKeyId`, `apiSecretId`
- `config`
- enabled models in `models` table

Scope:

- providers/models are app-global; workspace enable/disable is stored in override tables

## Extensions

MVP direction:

- extensions register AI tools and commands
- no large UI contribution surface in first pass

## Open implementation notes

- Shared RPC type definitions should be single-source and imported by both main and renderer.
- Keep stream event payloads small and stable.
- Use scoped Zustand selectors to avoid broad rerenders.
- Add inactive-tab throttling if stream volume becomes noticeable.

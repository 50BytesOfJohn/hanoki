![Hanoki banner](./assets/banner.png)

# Hanoki

A desktop AI chat app that treats conversations as something you can branch, organize, and keep local.

Most chat UIs are a single linear thread. Hanoki is built around a message tree instead — edit a reply, try another model, explore a side path, and keep the whole history without losing the original. Chats live in workspaces and folders, so longer work stays organized instead of drowning in one endless sidebar.

It's early (pre-alpha). Things move fast, break sometimes, and that's expected. If that sounds fun rather than scary, you're in the right place.

[hanoki.app](https://hanoki.app) · [Discord](https://discord.gg/uRCYRMrXUx)

## Why Hanoki

- **Branching chats** — every message can fork. Compare answers, backtrack, and keep alternatives without copy-pasting into a new thread.
- **Workspaces & folders** — group chats the way you actually work (projects, clients, experiments), not one flat list of titles.
- **Multi-provider** — cloud models and local ones (Ollama and friends). Swap providers without changing how you chat.
- **Local-first** — chats, settings, and structure live on your machine. Secrets go in the OS keychain, not a random config file.
- **Desktop-native** — built as a real Electron app with tabs, streaming, and a calm dark UI that stays out of the way.

## Getting the app

Grab a release from [GitHub Releases](https://github.com/50BytesOfJohn/hanoki/releases) or check [hanoki.app](https://hanoki.app).

### macOS notes

Builds are still **unsigned** (no Apple Developer license yet):

- **Auto-updates** — Apple Silicon builds check GitHub Releases in the background, download quietly, and offer a restart when the new version is staged. Also under **Hanoki → Check for Updates…** and **Settings → General → About**. Needs a signed build; unsigned local builds skip the updater entirely.
- **Gatekeeper** — macOS will block the first open. Allow it under **System Settings → Privacy & Security**, or right-click the app and choose **Open**.
- **Keychain** — on first use, macOS may ask for your login keychain password. That's expected; API keys are stored there on purpose.

If you want to support the project, contributions go toward an Apple Developer license so we can ship signed builds and proper auto-updates.

## Community

Questions, feedback, weird bugs, feature ideas — [join the Discord](https://discord.gg/uRCYRMrXUx).

Found a security issue? Don't open a public issue. Use the process in [SECURITY.md](./SECURITY.md).

---

## For developers

Hanoki is open source (MIT). Contributions are welcome — please read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a PR.

### Stack

- **Shell:** Electron Forge + Vite
- **UI:** React, TanStack Router, Tailwind, shadcn
- **AI:** Vercel AI SDK (streaming, tools, multi-provider)
- **Data:** SQLite + Drizzle in the main process
- **Tooling:** TypeScript, pnpm, OXC (lint/format), Vitest

### Requirements

- Node.js 22+
- pnpm 10.14.0

### Getting started

```bash
pnpm install
pnpm start
```

Other useful commands:

```bash
pnpm package   # package the app
pnpm make      # build distributables
pnpm test      # run tests
pnpm typecheck
```

### Lint & format

```bash
pnpm fmt
pnpm fmt:check
pnpm lint
pnpm lint:fix
```

### Project layout

```text
src/
  main.ts              # Electron main entry
  preload.ts           # Preload bridge
  main-process/        # DB, providers, AI streams, IPC, keychain
  renderer/            # React app (routes, features, stores)
  shared/              # Types and code shared across processes
```

### Internal docs

These are living notes for people working on the app:

- [`docs/SKETCHPAD.md`](./docs/SKETCHPAD.md) — product ideas and open questions
- [`docs/PLAN.md`](./docs/PLAN.md) — architecture and implementation plan
- [`docs/TASKS.md`](./docs/TASKS.md) — current task list
- [`docs/IPC.md`](./docs/IPC.md) — IPC conventions
- [`DESIGN.md`](./DESIGN.md) — UI system (“Sumi & Hinoki”)

### A few ground rules

- Pre-alpha: breaking changes are fine; don't bother with backward compatibility.
- Never create or edit Drizzle migrations — the maintainer handles those.
- Don't commit secrets, API keys, or personal chat data.
- Keep PRs focused. Big architectural swings should start as an issue.

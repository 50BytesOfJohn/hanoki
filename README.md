![Hanoki banner](./assets/banner.png)

# Hanoki

Hanoki app (Electron Forge + React). Early stage.

[Join the Discord](https://discord.gg/uRCYRMrXUx)

Contributions are welcome. Read [CONTRIBUTING.md](./CONTRIBUTING.md) before
opening a pull request, and report vulnerabilities through the private process
in [SECURITY.md](./SECURITY.md).

## macOS notes (important)

There's no Apple Developer license yet, so builds are **unsigned**:

- **No auto-updates** — you'll need to download new versions manually.
- **Gatekeeper** — macOS will block the app until you allow it in **System Settings → Privacy & Security** (or right-click → Open the first time).
- **Keychain** — on first use macOS may ask for your login keychain password. That's expected: API keys are stored in the Keychain so they stay secure.

If you'd like to support the project, contributions will go toward an Apple Developer license so we can ship proper signed installs and auto-updates.

## Product docs

- `docs/SKETCHPAD.md` — ideas, open questions, design notes
- `docs/PLAN.md` — concrete implementation plan and milestones
- `docs/TASKS.md` — repo-local tickets (step-by-step)
- `docs/IPC.md` — IPC structure and contributor rules

## Getting Started

```bash
# Install dependencies
pnpm install

# Run app
pnpm start

# Package app
pnpm package

# Build distributables
pnpm make
```

## Linting and formatting (OXC)

```bash
pnpm fmt
pnpm fmt:check
pnpm lint
pnpm lint:fix
```

## Project Structure

```text
src/
  main.ts                 # Electron main entry
  preload.ts              # Electron preload
  main-process/           # Main-process services
    config/               # Global TOML config
    db/                   # Drizzle schema/migrations/runtime
    system/               # OS/user-data paths
  mainview/               # React renderer app
```

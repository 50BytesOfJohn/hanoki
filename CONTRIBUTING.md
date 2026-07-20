# Contributing to Hanoki

Hanoki is pre-alpha. Breaking changes are expected, and focused pull requests
are easier to review and merge.

## Before you start

- Search existing issues and pull requests before opening a new one.
- Open an issue before starting a large feature or architectural change.
- Never include API keys, tokens, personal chat data, or other secrets.
- Do not create or edit Drizzle migrations. The maintainer handles migrations.

## Local setup

Requirements:

- Node.js 22 or newer
- pnpm 10.14.0

```bash
pnpm install
pnpm start
```

## Submit a change

1. Fork the repository and create a branch from `main`.
2. Make the smallest complete change that solves the issue.
3. Add or update tests when behavior changes.
4. Run the required checks:

```bash
pnpm fmt
pnpm lint
pnpm test
```

5. Open a pull request and complete the template.

All changes to `main` require maintainer review. Only the repository owner can
merge pull requests or publish releases.

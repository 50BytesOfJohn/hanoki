---
name: release-hanoki-app
description: Release the Hanoki Electron app by creating the commit and tag sequence that triggers the GitHub Actions release pipeline, then announcing the release on social media. Use when asked to release the app, cut a release, bump the patch version, or create and push the release tag for this repo. This skill first commits the current work with the git-commit skill, then creates a separate patch version bump commit, tags it with the new package version prefixed by v, pushes the branch and tag, and finally proposes release announcement posts for approval before publishing them via Buffer.
---

# Release Hanoki App

## Workflow

1. Confirm the release target is the current repo root and inspect the current branch and status.
2. Commit all release-ready changes first with [$git-commit](/Users/tom/Developer/repos/hanoki/.agents/skills/git-commit/SKILL.md).
3. Detailed Conventional Commit message with a useful body (GitHub release notes).
4. Keep the version bump out of that first commit.
5. Bump, release commit, tag, push (see Commands).
6. With `gh` CLI: approve the `create-release` environment, wait for it, then approve `publish`, wait for the **macOS** publish job.
7. After macOS publish finishes, propose tweets for approval, then publish (see Social).

## Release Rules

- Patch-only unless the user says otherwise.
- `pnpm version patch --no-git-tag-version` — version bump alone, no auto tag.
- Separate release commit: `chore(release): bump version to <new-version>`.
- Tag: `v<new-version>`. Push branch + tag. Never force-push.

## Pipeline (`gh`)

Both `create-release` and `publish` use environment `release` and need approval.

```bash
# Find run
gh run list --workflow=release.yml --limit 1

# Pending deployments (environment name is "release")
gh api repos/50BytesOfJohn/hanoki/actions/runs/<run-id>/pending_deployments

# Approve (environment id from pending payload)
gh api -X POST repos/50BytesOfJohn/hanoki/actions/runs/<run-id>/pending_deployments \
  -f state=approved -f comment='Approve v<version>' \
  -F environment_ids[]=<environment-id>

# Approve create-release first. When it finishes, publish waits — approve again.
# Then watch until the run completes:
gh run watch <run-id> --exit-status

# Gate social on macOS even if the overall run fails (linux/windows often fail):
gh run view <run-id> --json jobs --jq '.jobs[] | select(.name|test("macos")) | {name,status,conclusion}'
```

Linux/Windows may fail independently; still announce once macOS succeeds unless the user says otherwise.

## Social Announcement

Via [$buffer](/Users/tom/Developer/repos/hanoki/.agents/skills/buffer/SKILL.md), both channels after approval (`shareNow`):

| Channel | ID |
| ------- | -- |
| Bluesky | `677460164697c1deffd3a5ef` |
| X       | `677460664697c1deffd6de1e` |

Org: `66a27a5d618c283aaf6e4a9f` (`50BytesOfJohn`).

- Content from `git log <prev-tag>..<new-tag>` — highlights only.
- Same content both channels. Use Buffer `metadata.twitter.thread` / `metadata.bluesky.thread` (`text` must match first thread item).
- **No URL in the main post.** Put the download/release URL in the first thread reply. X deprioritizes posts with links in the root.
- Main post: the spotlight / most important change only.
- Thread replies: more detail per feature.
- Human tone. No em dashes. No AI slop.
- Propose drafts in chat → wait for approval → publish. Failed announcement does not undo the release.

## Repo Facts

- `.github/workflows/release.yml` on tags `v*`; tag must equal `v${package.json version}`.
- Environment-protected: approve `create-release`, then `publish` (matrix: linux/windows/macos).

## Commands

```bash
git status --short
git add -A
# git-commit skill for the feature commit
pnpm version patch --no-git-tag-version
git add package.json
git commit -m "chore(release): bump version to <new-version>"
git tag -a "v<new-version>" -m "v<new-version>"
git push origin HEAD
git push origin "v<new-version>"
```

## Stop Conditions

- Stop if changes look not release-ready, secrets, or unrelated work.
- Stop if the first commit or version bump looks wrong; fix before continuing.
- Never publish social without approval.

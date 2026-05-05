---
name: release-hanoki-app
description: Release the Hanoki Electron app by creating the commit and tag sequence that triggers the GitHub Actions release pipeline. Use when asked to release the app, cut a release, bump the patch version, or create and push the release tag for this repo. This skill first commits the current work with the git-commit skill, then creates a separate patch version bump commit, tags it with the new package version prefixed by v, and pushes the branch and tag.
---

# Release Hanoki App

## Workflow

1. Confirm the release target is the current repo root and inspect the current branch and status.
2. Commit all release-ready changes first with [$git-commit](/Users/tom/Developer/repos/hanoki/.agents/skills/git-commit/SKILL.md).
3. Ask the git-commit skill for a detailed Conventional Commit message with a useful body so GitHub-generated release notes stay readable.
4. Keep the version bump out of that first commit.
5. Read `.github/workflows/release.yml` and `package.json` if there is any doubt about the release flow.

## Release Rules

- Treat this repo as patch-only for releases unless the user explicitly says otherwise.
- Use `pnpm version patch --no-git-tag-version` for the version bump so the version change stays in its own commit and no tag is created automatically.
- Keep the release commit separate and format it as `chore(release): bump version to <new-version>`.
- Create the release tag as `v<new-version>`.
- Push the branch commit and the tag after the release commit is created.
- Never force-push.

## Repo Facts To Verify

- `.github/workflows/release.yml` runs on pushed tags matching `v*`.
- The workflow fails unless the pushed tag exactly matches `v${package.json version}`.
- The workflow creates the GitHub release and publishes artifacts after the tag push.
- Existing history uses dedicated release commits such as `chore(release): bump version to 0.0.2`.

## Commands

Use these commands as the default path unless the repo state requires a small adjustment:

```bash
git status --short
git add -A
# Use the git-commit skill for the first commit
pnpm version patch --no-git-tag-version
git add package.json
git commit -m "chore(release): bump version to <new-version>"
git tag -a "v<new-version>" -m "v<new-version>"
git push origin HEAD
git push origin "v<new-version>"
```

## Verification

- Read the new version from `package.json` after bumping.
- Confirm `git status --short` is clean before pushing.
- Confirm the tag points at the release commit.
- Tell the user that pushing the tag triggers the release workflow.

## Stop Conditions

- Stop and ask before proceeding if the repo contains changes that do not look release-ready, secrets, or unrelated work that should not be committed.
- Stop if the first commit fails and fix the cause before continuing.
- Stop if the version bump changes unexpected files and inspect them before committing.

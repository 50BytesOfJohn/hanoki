# Releasing

## Cutting a version

`package.json` is the single source of truth for the app version — `app.getVersion()`
reads it, Settings → General → About shows it, and the updater sends it to the
update server. The tag has to match, so let npm write both:

```sh
pnpm version patch -m "chore(release): bump version to %s"   # or minor / major
git push --follow-tags
```

That writes `package.json`, commits, and tags `v<version>` in one step. The
Release workflow refuses to build if the tag and `package.json` disagree, so
never hand-edit one without the other.

A tag containing `-` (e.g. `v0.1.0-beta.1`) is published as a GitHub pre-release.
The update server skips pre-releases, so those never reach existing installs.

## What auto-update needs from a release

Updates run through [update.electronjs.org](https://update.electronjs.org), the
Electron team's free update server for public GitHub repos. It reads our
releases and picks the asset by **filename**, so the naming in
`forge.config.ts` is load-bearing:

| Requirement                                   | Where it is satisfied                         |
| --------------------------------------------- | --------------------------------------------- |
| A `.zip` of the `.app` (not the `.dmg`)       | `MakerZIP` in `forge.config.ts`               |
| Name matches `*-(mac\|darwin\|osx)*.zip`      | `src/shared/release/mac-artifact-name.ts`     |
| Name carries `-arm64`, or it is served as x64 | same, covered by its test                     |
| Release is public, not a draft or pre-release | Release workflow                              |
| The `.app` is signed **and notarized**        | `APPLE_*` secrets → `osxSign` / `osxNotarize` |

Signing is not optional: Squirrel.Mac refuses to swap in a bundle whose
signature does not match the running app, so an unsigned or ad-hoc release ships
updates that silently fail to install.

To check what the server sees for a given version:

```sh
curl -i https://update.electronjs.org/50BytesOfJohn/hanoki/darwin-arm64/0.0.22
```

`204` means up to date, `200` returns the update JSON, `404` means no matching
asset was found in any release.

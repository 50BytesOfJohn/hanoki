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
The update feed resolves through GitHub's "latest" release, which skips
pre-releases, so those never reach existing installs.

The release stays a draft until every platform has uploaded, then
`finalize-release` publishes it. If a build fails, re-run it; the release
stays hidden from updaters until then.

## How updates reach an install

The app reads `RELEASES.json` from
`https://github.com/50BytesOfJohn/hanoki/releases/latest/download/`.
`scripts/publish-mac-update-feed.mts` attaches that file to each stable release,
with the ZIP's digest and size and a binary delta from the previous release.

- **Delta:** an install on exactly the previous version downloads the patch,
  applies it to a copy of itself and verifies the signature. Any failure falls
  back to the ZIP in the same check, as does being on an older version.
- **Resume:** GitHub's CDN sends an `ETag` and honours `Range`, so an interrupted
  download continues on the next check, including after a relaunch.

Deltas are built from the signed, notarized ZIPs that shipped, and only apply to
an identical bundle, so never re-upload the ZIP of a published release.

To see what installs see:

```sh
curl -sL https://github.com/50BytesOfJohn/hanoki/releases/latest/download/RELEASES.json
```

## What older installs need from a release

Installs on 0.0.37 or earlier still ask
[update.electronjs.org](https://update.electronjs.org), which reads our releases
and picks the asset by **filename**. Their next update moves them to the feed
above, but until they have all moved the naming in `forge.config.ts` stays
load-bearing:

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

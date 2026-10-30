/**
 * The static `RELEASES.json` feed Squirrel.Mac reads (`serverType: "json"`).
 *
 * Unlike update.electronjs.org, this format can declare a digest for the ZIP and
 * a binary delta from one earlier build. Only the entry matching `currentRelease`
 * is ever used, so the feed describes the newest release and nothing else.
 *
 * https://github.com/Squirrel/Squirrel.Mac#update-file-json-format
 */

export const MAC_UPDATE_FEED_NAME = "RELEASES.json";

export interface ReleaseFile {
  name: string;
  /** Hex-encoded SHA-256 digest. */
  sha256: string;
  size: number;
}

export interface MacUpdateFeedInput {
  /** `owner/name` of the GitHub repository hosting the release. */
  repository: string;
  version: string;
  tag: string;
  pubDate: string;
  notes: string;
  zip: ReleaseFile;
  delta?: ReleaseFile & { fromVersion: string };
}

export function macDeltaName(arch: string, fromVersion: string, toVersion: string): string {
  // No `.zip` extension: update.electronjs.org must never mistake this for the
  // full update it hands to installs still on that feed.
  return `hanoki-macos-${arch}-${fromVersion}-to-${toVersion}.delta`;
}

export function buildMacUpdateFeed(input: MacUpdateFeedInput) {
  const { repository, version, tag, pubDate, notes, zip, delta } = input;
  const assetUrl = (name: string) =>
    `https://github.com/${repository}/releases/download/${tag}/${encodeURIComponent(name)}`;

  return {
    currentRelease: version,
    releases: [
      {
        version,
        updateTo: {
          version,
          name: tag,
          notes,
          pub_date: pubDate,
          url: assetUrl(zip.name),
          sha256: zip.sha256,
          size: zip.size,
          ...(delta
            ? {
                delta: {
                  // Compared against the running app's CFBundleVersion, which
                  // packager derives from the package.json version.
                  from_version: delta.fromVersion,
                  url: assetUrl(delta.name),
                  sha256: delta.sha256,
                  size: delta.size,
                },
              }
            : {}),
        },
      },
    ],
  };
}

/**
 * Publishes the macOS update feed for a release that is still a draft:
 * a binary delta from the previous release (when one can be made) and
 * `RELEASES.json`. See docs/RELEASE.md.
 *
 * Usage: node scripts/publish-mac-update-feed.mts <tag> <path-to-BinaryDelta>
 */
import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";

import { macArtifactName } from "../src/shared/release/mac-artifact-name.ts";
import {
  buildMacUpdateFeed,
  MAC_UPDATE_FEED_NAME,
  macDeltaName,
  type ReleaseFile,
} from "../src/shared/release/mac-update-feed.ts";

const ARCH = "arm64";
const APP_BUNDLE = "Hanoki.app";

const execFile = promisify(execFileCallback);
const run = async (command: string, args: string[]) =>
  (await execFile(command, args, { maxBuffer: 16 * 1024 * 1024 })).stdout.trim();

async function describeFile(filePath: string): Promise<ReleaseFile> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(filePath), hash);
  return {
    name: path.basename(filePath),
    sha256: hash.digest("hex"),
    size: (await stat(filePath)).size,
  };
}

async function extractApp(zipPath: string, destination: string): Promise<string> {
  // ditto, not unzip: the delta is only valid against the exact tree that ships.
  await run("ditto", ["-x", "-k", zipPath, destination]);
  return path.join(destination, APP_BUNDLE);
}

/**
 * A delta only saves bytes, and the ZIP always remains as the fallback, so any
 * failure here costs bandwidth rather than the release.
 */
async function createDelta(args: {
  tag: string;
  version: string;
  binaryDelta: string;
  zipPath: string;
  workDir: string;
}): Promise<(ReleaseFile & { fromVersion: string }) | undefined> {
  const { tag, version, binaryDelta, zipPath, workDir } = args;

  try {
    // The release being published is a draft, so "latest" is still the previous one.
    const previousTag = await run("gh", ["release", "view", "--json", "tagName", "-q", ".tagName"]);
    const fromVersion = previousTag.replace(/^v/, "");
    if (previousTag === tag) {
      console.log(`${tag} is already the latest release, skipping the delta`);
      return undefined;
    }

    const previousZipName = macArtifactName(ARCH, fromVersion, ".zip");
    await run("gh", ["release", "download", previousTag, "-p", previousZipName, "-D", workDir]);

    const oldApp = await extractApp(path.join(workDir, previousZipName), path.join(workDir, "old"));
    const newApp = await extractApp(zipPath, path.join(workDir, "new"));
    const deltaPath = path.join(workDir, macDeltaName(ARCH, fromVersion, version));
    await run(binaryDelta, ["create", oldApp, newApp, deltaPath]);

    return { ...(await describeFile(deltaPath)), fromVersion };
  } catch (error) {
    console.warn("Could not create a binary delta, publishing the ZIP only:", error);
    return undefined;
  }
}

const [tag, binaryDelta] = process.argv.slice(2);
if (!tag || !binaryDelta) {
  throw new Error("Usage: publish-mac-update-feed.mts <tag> <path-to-BinaryDelta>");
}

const repository = process.env.GITHUB_REPOSITORY ?? "50BytesOfJohn/hanoki";
const { version } = JSON.parse(await readFile("package.json", "utf8")) as { version: string };
const zipPath = path.resolve("out/make/zip/darwin", ARCH, macArtifactName(ARCH, version, ".zip"));
const workDir = await mkdtemp(path.join(tmpdir(), "hanoki-update-feed-"));

try {
  const delta = await createDelta({ tag, version, binaryDelta, zipPath, workDir });
  const notes = await run("gh", ["release", "view", tag, "--json", "body", "-q", ".body"]);
  const feed = buildMacUpdateFeed({
    repository,
    version,
    tag,
    pubDate: new Date().toISOString(),
    notes,
    zip: await describeFile(zipPath),
    delta,
  });

  const feedPath = path.join(workDir, MAC_UPDATE_FEED_NAME);
  await writeFile(feedPath, `${JSON.stringify(feed, null, 2)}\n`);

  const assets = [feedPath, ...(delta ? [path.join(workDir, delta.name)] : [])];
  await run("gh", ["release", "upload", tag, ...assets, "--clobber"]);

  const zipSize = feed.releases[0].updateTo.size;
  console.log(
    delta
      ? `Published ${delta.name}: ${delta.size} bytes instead of ${zipSize}`
      : `Published the feed without a delta (${zipSize} byte ZIP)`,
  );
} finally {
  await rm(workDir, { recursive: true, force: true });
}

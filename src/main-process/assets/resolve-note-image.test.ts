import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { HANOKI_ASSET_SCHEME, noteImageUrl } from "@shared/assets/protocol";

import { loadNoteImage, type NoteImageLocation } from "./resolve-note-image";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "hanoki-note-image-"));
  tempDirs.push(dir);
  return dir;
}

function locate(location: NoteImageLocation) {
  return () => location;
}

describe("loadNoteImage", () => {
  it("serves an image inside the note directory", async () => {
    const root = await makeTempDir();
    const noteDirectory = join(root, "Garden");
    await mkdir(noteDirectory);
    await writeFile(join(noteDirectory, "fern.png"), "png-bytes");
    await writeFile(join(root, "shared.png"), "shared");

    const loaded = await loadNoteImage(
      noteImageUrl("workspace", "note", "fern.png"),
      locate({ root, noteDirectory }),
    );
    expect(loaded.status).toBe(200);
    expect(loaded.contentType).toBe("image/png");
    expect(Buffer.from(loaded.body).toString()).toBe("png-bytes");

    const parentImage = await loadNoteImage(
      noteImageUrl("workspace", "note", "../shared.png"),
      locate({ root, noteDirectory }),
    );
    expect(parentImage.status).toBe(200);
    expect(Buffer.from(parentImage.body).toString()).toBe("shared");
  });

  it("rejects parent traversal", async () => {
    const parent = await makeTempDir();
    const root = join(parent, "vault");
    await mkdir(root);
    await writeFile(join(parent, "secret.png"), "secret");

    const loaded = await loadNoteImage(
      noteImageUrl("workspace", "note", "../secret.png"),
      locate({ root, noteDirectory: root }),
    );
    expect(loaded.status).toBe(403);
    expect(loaded.reason).toBe("traversal");
    expect(loaded.body.byteLength).toBe(0);
  });

  it("rejects encoded traversal", async () => {
    const parent = await makeTempDir();
    const root = join(parent, "vault");
    await mkdir(root);
    await writeFile(join(parent, "secret.png"), "secret");

    const encoded = `${HANOKI_ASSET_SCHEME}://asset/workspace/note?src=%2e%2e%2fsecret.png`;
    const once = await loadNoteImage(encoded, locate({ root, noteDirectory: root }));
    expect(once.reason).toBe("traversal");

    const nested = join(root, "nested");
    await mkdir(nested);
    const twice = await loadNoteImage(
      noteImageUrl("workspace", "note", "%2e%2e/%2e%2e/secret.png"),
      locate({ root, noteDirectory: nested }),
    );
    expect(twice.reason).toBe("traversal");
  });

  it("rejects a symlink that leaves the root", async () => {
    const root = await makeTempDir();
    const outside = await makeTempDir();
    const outsideFile = join(outside, "secret.png");
    await writeFile(outsideFile, "secret");
    await symlink(outsideFile, join(root, "escape.png"));

    const loaded = await loadNoteImage(
      noteImageUrl("workspace", "note", "escape.png"),
      locate({ root, noteDirectory: root }),
    );
    expect(loaded.status).toBe(403);
    expect(loaded.reason).toBe("symlink");
  });

  it("rejects an absolute path outside the root", async () => {
    const root = await makeTempDir();
    const outside = await makeTempDir();
    const outsideFile = join(outside, "secret.png");
    await writeFile(outsideFile, "secret");
    await writeFile(join(root, "fern.png"), "png-bytes");

    const rejected = await loadNoteImage(
      noteImageUrl("workspace", "note", outsideFile),
      locate({ root, noteDirectory: root }),
    );
    expect(rejected.status).toBe(403);
    expect(rejected.reason).toBe("outside");

    const allowed = await loadNoteImage(
      noteImageUrl("workspace", "note", join(root, "fern.png")),
      locate({ root, noteDirectory: root }),
    );
    expect(allowed.status).toBe(200);

    const fileUrl = await loadNoteImage(
      noteImageUrl("workspace", "note", `file://${outsideFile}`),
      locate({ root, noteDirectory: root }),
    );
    expect(fileUrl.reason).toBe("outside");
  });

  it("rejects a non-image file", async () => {
    const root = await makeTempDir();
    await writeFile(join(root, "notes.txt"), "hello");

    const loaded = await loadNoteImage(
      noteImageUrl("workspace", "note", "notes.txt"),
      locate({ root, noteDirectory: root }),
    );
    expect(loaded.status).toBe(403);
    expect(loaded.reason).toBe("type");
  });

  it("reports a missing file", async () => {
    const root = await makeTempDir();
    const loaded = await loadNoteImage(
      noteImageUrl("workspace", "note", "missing.png"),
      locate({ root, noteDirectory: root }),
    );
    expect(loaded.status).toBe(404);
    expect(loaded.reason).toBe("missing");
  });
});

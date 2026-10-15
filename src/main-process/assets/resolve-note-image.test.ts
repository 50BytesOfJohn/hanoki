import { mkdir, mkdtemp, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path, { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { HANOKI_ASSET_SCHEME, noteImageUrl } from "@shared/assets/protocol";

import {
  loadNoteImage,
  MAX_NOTE_IMAGE_BYTES,
  resolveNoteImageLexical,
  type NoteImageLocation,
} from "./resolve-note-image";

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

  it("serves a file whose name contains a percent sign", async () => {
    const root = await makeTempDir();
    await writeFile(join(root, "50%.png"), "half");

    const loaded = await loadNoteImage(
      noteImageUrl("workspace", "note", "50%.png"),
      locate({ root, noteDirectory: root }),
    );
    expect(loaded.status).toBe(200);
    expect(Buffer.from(loaded.body).toString()).toBe("half");
  });

  it("reports an oversized image as missing", async () => {
    const root = await makeTempDir();
    const file = join(root, "big.png");
    await writeFile(file, "png");
    await truncate(file, MAX_NOTE_IMAGE_BYTES + 1);

    const loaded = await loadNoteImage(
      noteImageUrl("workspace", "note", "big.png"),
      locate({ root, noteDirectory: root }),
    );
    expect(loaded.status).toBe(404);
    expect(loaded.reason).toBe("missing");
    expect(loaded.body.byteLength).toBe(0);
  });
});

describe("resolveNoteImageLexical", () => {
  const root = path.win32.resolve("C:\\vault");
  const noteDirectory = path.win32.resolve(root, "Garden");

  it("keeps a windows path inside the vault", () => {
    expect(resolveNoteImageLexical(root, noteDirectory, "fern.png")).toEqual({
      ok: true,
      filePath: path.win32.resolve(noteDirectory, "fern.png"),
      absolute: false,
    });
  });

  it("rejects a windows path that leaves the vault", () => {
    expect(
      resolveNoteImageLexical(root, noteDirectory, path.win32.join("..", "..", "secret.png")),
    ).toEqual({ ok: false, reason: "traversal" });
    expect(
      resolveNoteImageLexical(root, noteDirectory, path.win32.resolve("D:\\other", "fern.png")),
    ).toEqual({ ok: false, reason: "outside" });
  });

  it("rejects windows UNC and device paths", () => {
    const sources = [
      path.win32.resolve("\\\\server\\share", "fern.png"),
      "\\\\?\\C:\\fern.png",
      "\\\\.\\C:\\fern.png",
      "//server/share/fern.png",
      "file:////server/share/fern.png",
    ];
    for (const src of sources) {
      expect(resolveNoteImageLexical(root, noteDirectory, src)).toEqual({
        ok: false,
        reason: "outside",
      });
    }
  });
});

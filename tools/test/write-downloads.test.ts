import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeDownloads, readRawDownloads } from "../src/downloads-generate.js";
import type { RawDownloads } from "../src/downloads-types.js";

let out: string;
afterEach(async () => {
  if (out) await rm(out, { recursive: true, force: true });
});

const raw: RawDownloads = {
  generated_at: "2026-06-14T00:00:00Z",
  ocis: [
    {
      tag_name: "v7.1.0",
      name: "ocis 7.1.0",
      published_at: "2026-02-01T00:00:00Z",
      html_url: "https://github.com/owncloud/ocis/releases/tag/v7.1.0",
      body: "notes",
      assets: [
        {
          name: "ocis-7.1.0-linux-amd64",
          browser_download_url: "https://example.com/ocis-7.1.0-linux-amd64",
          size: 2 * 1024 * 1024,
        },
      ],
    },
  ],
  client: [],
  android: [],
  ios: [],
};

describe("writeDownloads", () => {
  it("writes the normalized downloads.json under api/v1", async () => {
    out = await mkdtemp(join(tmpdir(), "dl-"));
    await writeDownloads(out, raw);

    const written = JSON.parse(await readFile(join(out, "api/v1/downloads.json"), "utf8"));
    expect(written.generatedAt).toBe("2026-06-14T00:00:00Z");
    expect(written.ocis.version).toBe("7.1.0");
    expect(written.ocis.binaries[0]).toEqual({
      os: "Linux",
      arch: "amd64",
      size: "2.0 MB",
      url: "https://example.com/ocis-7.1.0-linux-amd64",
    });
    expect(written.client).toBeNull();
  });

  it("is deterministic: re-running yields byte-identical output", async () => {
    out = await mkdtemp(join(tmpdir(), "dl-"));
    await writeDownloads(out, raw);
    const first = await readFile(join(out, "api/v1/downloads.json"), "utf8");
    await writeDownloads(out, raw);
    const second = await readFile(join(out, "api/v1/downloads.json"), "utf8");
    expect(second).toBe(first);
  });
});

describe("readRawDownloads", () => {
  it("reads and parses an existing raw downloads file", async () => {
    out = await mkdtemp(join(tmpdir(), "dl-"));
    const path = join(out, "downloads.json");
    await writeFile(path, JSON.stringify(raw), "utf8");
    expect(await readRawDownloads(path)).toEqual(raw);
  });

  it("returns null when the file does not exist", async () => {
    out = await mkdtemp(join(tmpdir(), "dl-"));
    expect(await readRawDownloads(join(out, "missing.json"))).toBeNull();
  });
});

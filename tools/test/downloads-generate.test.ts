import { describe, it, expect } from "vitest";
import {
  formatSize,
  matchBinaries,
  normalizeRelease,
  normalizeDownloads,
} from "../src/downloads-generate.js";
import type { RawAsset, RawRelease, RawDownloads } from "../src/downloads-types.js";

// Default size is 2 MiB so matched rows render as "2.0 MB" deterministically.
const asset = (name: string, size = 2 * 1024 * 1024): RawAsset => ({
  name,
  browser_download_url: `https://example.com/${name}`,
  size,
});

// A minimal raw release; tag drives version, the rest is fixed for assertions.
const release = (
  tag: string,
  assets: RawAsset[] = [asset(`ocis-${tag}-linux-amd64`)],
): RawRelease => ({
  tag_name: tag,
  name: `ocis ${tag}`,
  published_at: "2026-01-02T03:04:05Z",
  html_url: `https://github.com/owncloud/ocis/releases/tag/${tag}`,
  body: "notes",
  assets,
});

describe("formatSize", () => {
  it("formats >= 1 MB with one decimal", () => {
    expect(formatSize(42_100_000)).toBe("40.1 MB");
  });
  it("formats < 1 MB as rounded KB", () => {
    expect(formatSize(2048)).toBe("2 KB");
  });
});

describe("matchBinaries", () => {
  it("matches Linux/macOS/Windows amd64+arm64 and labels them", () => {
    const assets = [
      asset("ocis-7.1.0-linux-amd64"),
      asset("ocis-7.1.0-linux-arm64"),
      asset("ocis-7.1.0-darwin-amd64"),
      asset("ocis-7.1.0-darwin-arm64"),
      asset("ocis-7.1.0-windows-amd64.exe"),
    ];
    const rows = matchBinaries(assets);
    expect(rows.map((r) => `${r.os}/${r.arch}`)).toEqual([
      "Linux/amd64",
      "Linux/arm64",
      "macOS/amd64",
      "macOS/arm64",
      "Windows/amd64",
    ]);
    expect(rows[0].url).toBe("https://example.com/ocis-7.1.0-linux-amd64");
    expect(rows[0].size).toBe("2.0 MB");
  });

  it("excludes checksum, pdf and tarball assets", () => {
    const assets = [
      asset("ocis-7.1.0-linux-amd64.sha256"),
      asset("ocis-7.1.0-linux-amd64.pdf"),
      asset("ocis-7.1.0-linux-amd64.tar.gz"),
    ];
    expect(matchBinaries(assets)).toEqual([]);
  });

  it("returns [] when no assets match the matrix", () => {
    expect(matchBinaries([asset("README.md"), asset("source.zip")])).toEqual([]);
  });
});

describe("normalizeRelease", () => {
  it("maps a raw release to a surface, stripping the leading v from the version", () => {
    const surface = normalizeRelease(release("v7.1.0"));
    expect(surface).toEqual({
      version: "7.1.0",
      releaseUrl: "https://github.com/owncloud/ocis/releases/tag/v7.1.0",
      publishedAt: "2026-01-02T03:04:05Z",
      binaries: [
        {
          os: "Linux",
          arch: "amd64",
          size: "2.0 MB",
          url: "https://example.com/ocis-v7.1.0-linux-amd64",
        },
      ],
    });
  });

  it("keeps a version that has no leading v", () => {
    expect(normalizeRelease(release("7.1.0")).version).toBe("7.1.0");
  });
});

describe("normalizeDownloads", () => {
  const raw: RawDownloads = {
    generated_at: "2026-06-14T00:00:00Z",
    ocis: [
      { ...release("v7.0.0"), published_at: "2026-01-01T00:00:00Z" },
      { ...release("v7.1.0"), published_at: "2026-02-01T00:00:00Z" },
    ],
    client: [release("v5.0.0")],
    android: [],
    ios: [],
  };

  it("picks the most recently published release per surface", () => {
    const out = normalizeDownloads(raw);
    expect(out.ocis?.version).toBe("7.1.0");
    expect(out.client?.version).toBe("5.0.0");
    expect(out.generatedAt).toBe("2026-06-14T00:00:00Z");
  });

  it("yields null for a surface with no releases", () => {
    const out = normalizeDownloads(raw);
    expect(out.android).toBeNull();
    expect(out.ios).toBeNull();
  });
});

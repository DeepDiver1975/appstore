import { describe, it, expect } from "vitest";
import {
  selectReleases,
  buildRawDownloads,
  SURFACE_REPOS,
  type GhRelease,
} from "../src/cli/fetch-downloads.js";

const gh = (overrides: Partial<GhRelease> = {}): GhRelease => ({
  tag_name: "v1.0.0",
  name: "rel",
  published_at: "2026-01-01T00:00:00Z",
  html_url: "https://github.com/owncloud/ocis/releases/tag/v1.0.0",
  body: "notes",
  draft: false,
  prerelease: false,
  assets: [{ name: "ocis-1.0.0-linux-amd64", browser_download_url: "https://ex/a", size: 10 }],
  ...overrides,
});

describe("selectReleases", () => {
  it("maps GitHub releases to the trimmed raw shape", () => {
    expect(selectReleases([gh()])).toEqual([
      {
        tag_name: "v1.0.0",
        name: "rel",
        published_at: "2026-01-01T00:00:00Z",
        html_url: "https://github.com/owncloud/ocis/releases/tag/v1.0.0",
        body: "notes",
        assets: [
          { name: "ocis-1.0.0-linux-amd64", browser_download_url: "https://ex/a", size: 10 },
        ],
      },
    ]);
  });

  it("drops drafts and prereleases", () => {
    const releases = [
      gh({ tag_name: "v1.0.0" }),
      gh({ tag_name: "v1.1.0-rc.1", prerelease: true }),
      gh({ tag_name: "v1.2.0", draft: true }),
    ];
    expect(selectReleases(releases).map((r) => r.tag_name)).toEqual(["v1.0.0"]);
  });
});

describe("buildRawDownloads", () => {
  it("assembles per-surface releases with the generation timestamp", () => {
    const raw = buildRawDownloads(
      {
        ocis: [gh({ tag_name: "v7.1.0" })],
        client: [],
        android: [],
        ios: [],
      },
      "2026-06-14T00:00:00Z",
    );
    expect(raw.generated_at).toBe("2026-06-14T00:00:00Z");
    expect(raw.ocis.map((r) => r.tag_name)).toEqual(["v7.1.0"]);
    expect(raw.client).toEqual([]);
  });
});

describe("SURFACE_REPOS", () => {
  it("maps each surface to its ownCloud repo", () => {
    expect(SURFACE_REPOS).toEqual({
      ocis: "owncloud/ocis",
      client: "owncloud/client",
      android: "owncloud/android",
      ios: "owncloud/ios",
    });
  });
});

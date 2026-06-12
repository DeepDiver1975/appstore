import { describe, it, expect } from "vitest";
import { buildApp, appsForPlatformVersion } from "../src/generate.js";
import type { AppInfo } from "../src/types.js";

const base: AppInfo = {
  id: "calendar",
  name: "Calendar",
  summary: "s",
  description: "d",
  license: "AGPL",
  author: "ownCloud GmbH",
  version: "1.0.0",
  categories: ["tools"],
  screenshots: ["https://e.com/1.png"],
  platformMin: "10.0.0",
  platformMax: "10.99.99",
};

const created = () => "2026-06-11T00:00:00+00:00";
// Default: no ingested screenshots. Individual tests pass their own provider.
const noScreenshots = () => [];

describe("buildApp", () => {
  it("produces a faithful ApiApp with flat platform keys and static defaults", () => {
    const app = buildApp("calendar", [base], created, () => ["01.png"], "https://site");
    expect(app.id).toBe("calendar");
    expect(app.type).toBe("app");
    expect(app.downloads).toBe(0);
    expect(app.rating).toBeNull();
    expect(app.downloadable).toBe(true);
    // Screenshots are served same-origin from ingested files, not the info.xml URL.
    expect(app.screenshots).toEqual([
      { url: "https://site/apps/calendar/releases/1.0.0/screenshots/01.png" },
    ]);
    expect(app.marketplace).toBe("https://site/apps/calendar");
    expect(app.publisher).toEqual({ name: "ownCloud GmbH", url: "" });
    expect(app.releases[0]).toEqual({
      platformMin: "10.0.0",
      platformMax: "10.99.99",
      version: "1.0.0",
      download: "https://site/apps/calendar/releases/1.0.0/package.tar.gz",
      license: "AGPL",
      created: "2026-06-11T00:00:00+00:00",
    });
  });

  it("uses the newest release for app-level display fields and sorts releases desc", () => {
    const v2: AppInfo = { ...base, version: "2.0.0", name: "Calendar v2", description: "newer" };
    const app = buildApp("calendar", [base, v2], created, noScreenshots, "https://site");
    expect(app.name).toBe("Calendar v2");
    expect(app.description).toBe("newer");
    expect(app.releases.map((r) => r.version)).toEqual(["2.0.0", "1.0.0"]);
  });
});

describe("appsForPlatformVersion", () => {
  const v10 = buildApp("calendar", [base], created, noScreenshots, "https://site"); // 10.0.0–10.99.99
  const onlyNewer = buildApp(
    "notes",
    [{ ...base, id: "notes", platformMin: "11.0.0", platformMax: "11.99.99" }],
    created,
    noScreenshots,
    "https://site",
  );

  it("includes apps whose release range covers the target version", () => {
    const apps = appsForPlatformVersion([v10, onlyNewer], "10.5.0");
    expect(apps.map((a) => a.id)).toEqual(["calendar"]);
  });

  it("includes only matching releases within an included app", () => {
    const multi = buildApp(
      "calendar",
      [base, { ...base, version: "2.0.0", platformMin: "11.0.0", platformMax: "11.99.99" }],
      created,
      noScreenshots,
      "https://site",
    );
    const [app] = appsForPlatformVersion([multi], "10.5.0");
    expect(app.releases.map((r) => r.version)).toEqual(["1.0.0"]);
  });
});

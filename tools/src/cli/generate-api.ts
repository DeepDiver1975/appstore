import { cp, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { scanApps } from "../scan.js";
import { validateRelease } from "../validate.js";
import { buildApp, writeApi } from "../generate.js";
import { makeGitCreatedProvider } from "../created.js";
import { listScreenshots, screenshotsDir } from "../screenshots.js";
import { BASE_URL, KNOWN_PLATFORM_VERSIONS } from "../config.js";
import type { AppInfo } from "../types.js";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/**
 * Usage: tsx src/cli/generate-api.ts [--apps apps] [--out _site]
 * Re-validates all releases (defense in depth), then writes the static API.
 */
async function main(): Promise<void> {
  const appsDir = arg("--apps", "apps");
  const outDir = arg("--out", "_site");

  const refs = await scanApps(appsDir);
  const byApp = new Map<string, AppInfo[]>();
  for (const ref of refs) {
    const info = await validateRelease(ref); // re-validate during build
    const list = byApp.get(ref.appId) ?? [];
    list.push(info);
    byApp.set(ref.appId, list);
  }

  const created = await makeGitCreatedProvider(
    refs.map((r) => ({ appId: r.appId, version: r.version, dir: r.dir })),
    "1970-01-01T00:00:00+00:00",
  );

  // Map each release to its ingested screenshot files on disk; buildApp turns
  // these into same-origin URLs. Keyed by appId/version, read once up front.
  const screenshotsByRelease = new Map<string, string[]>();
  for (const ref of refs) {
    screenshotsByRelease.set(`${ref.appId}@${ref.version}`, await listScreenshots(ref.dir));
  }
  const screenshots = (appId: string, version: string): string[] =>
    screenshotsByRelease.get(`${appId}@${version}`) ?? [];

  const apps = [...byApp.entries()]
    .map(([appId, infos]) => buildApp(appId, infos, created, screenshots, BASE_URL))
    .sort((a, b) => a.id.localeCompare(b.id));

  await writeApi(outDir, apps, KNOWN_PLATFORM_VERSIONS);

  // Copy ingested screenshot files into the served tree so the same-origin URLs
  // resolve: _site/apps/{id}/releases/{version}/screenshots/*.
  for (const ref of refs) {
    const files = screenshotsByRelease.get(`${ref.appId}@${ref.version}`) ?? [];
    if (files.length === 0) continue;
    const destDir = join(outDir, "apps", ref.appId, "releases", ref.version, "screenshots");
    await mkdir(destDir, { recursive: true });
    for (const file of files) {
      await cp(join(screenshotsDir(ref.dir), file), join(destDir, file));
    }
  }

  console.log(`Generated API for ${apps.length} app(s) into ${outDir}/api/v1/`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

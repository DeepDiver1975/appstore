import semver from "semver";
import type { AppInfo, ApiApp, ApiRelease } from "./types.js";

/** Provides the ISO-8601 created timestamp for a given appId/version. */
export type CreatedProvider = (appId: string, version: string) => string;

function coerce(v: string): semver.SemVer {
  const c = semver.coerce(v);
  if (!c) throw new Error(`cannot parse version "${v}"`);
  return c;
}

/** Sort version strings descending (newest first). */
function byVersionDesc(a: string, b: string): number {
  return semver.rcompare(coerce(a), coerce(b));
}

/**
 * Build one ApiApp from all of an app's release AppInfos. App-level display
 * fields come from the newest release; releases are sorted newest-first.
 */
export function buildApp(
  appId: string,
  infos: AppInfo[],
  created: CreatedProvider,
  baseUrl: string,
): ApiApp {
  const sorted = [...infos].sort((a, b) => byVersionDesc(a.version, b.version));
  const newest = sorted[0];

  const releases: ApiRelease[] = sorted.map((info) => ({
    platformMin: info.platformMin,
    platformMax: info.platformMax,
    version: info.version,
    download: `${baseUrl}/apps/${appId}/releases/${info.version}/package.tar.gz`,
    license: info.license,
    created: created(appId, info.version),
  }));

  return {
    id: appId,
    type: "app",
    name: newest.name,
    categories: newest.categories,
    description: newest.description,
    screenshots: newest.screenshots.map((url) => ({ url })),
    marketplace: `${baseUrl}/apps/${appId}`,
    downloads: 0,
    rating: null,
    downloadable: true,
    publisher: { name: newest.author, url: "" },
    releases,
  };
}

function releaseCoversVersion(rel: ApiRelease, version: string): boolean {
  const v = coerce(version);
  return semver.gte(v, coerce(rel.platformMin)) && semver.lte(v, coerce(rel.platformMax));
}

/**
 * Filter the full catalog to apps having at least one release compatible with
 * `version`, narrowing each app's releases to the compatible ones.
 */
export function appsForPlatformVersion(apps: ApiApp[], version: string): ApiApp[] {
  const result: ApiApp[] = [];
  for (const app of apps) {
    const releases = app.releases.filter((r) => releaseCoversVersion(r, version));
    if (releases.length > 0) result.push({ ...app, releases });
  }
  return result;
}

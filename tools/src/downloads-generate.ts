import type {
  RawAsset,
  RawRelease,
  RawDownloads,
  DownloadBinary,
  DownloadSurface,
  Downloads,
} from "./downloads-types.js";

/** Format a byte count: >= 1 MB → "N.N MB", otherwise "N KB" (rounded). */
export function formatSize(bytes: number): string {
  const MB = 1024 * 1024;
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

/**
 * OS/arch matcher rules, applied in order. Each rule's regex is tested against
 * the asset file name (case-insensitive). Checksums, PDFs and source tarballs
 * are excluded by requiring the name NOT to end in those extensions.
 */
interface Rule {
  os: string;
  arch: string;
  re: RegExp;
}
const RULES: Rule[] = [
  { os: "Linux", arch: "amd64", re: /linux[-_]amd64$/i },
  { os: "Linux", arch: "arm64", re: /linux[-_]arm64$/i },
  { os: "macOS", arch: "amd64", re: /darwin[-_]amd64$/i },
  { os: "macOS", arch: "arm64", re: /darwin[-_]arm64$/i },
  { os: "Windows", arch: "amd64", re: /windows[-_]amd64\.exe$/i },
];

const EXCLUDE_RE = /\.(sha256|pdf|tar\.gz)$/i;

/**
 * Resolve a release's assets into typed binary download rows, in RULES order.
 * Assets matching no rule (or excluded extensions) are dropped. Returns [] when
 * nothing matches (caller renders a "Browse on GitHub" fallback).
 */
export function matchBinaries(assets: RawAsset[]): DownloadBinary[] {
  const rows: DownloadBinary[] = [];
  for (const rule of RULES) {
    const hit = assets.find((a) => !EXCLUDE_RE.test(a.name) && rule.re.test(a.name));
    if (hit) {
      rows.push({
        os: rule.os,
        arch: rule.arch,
        size: formatSize(hit.size),
        url: hit.browser_download_url,
      });
    }
  }
  return rows;
}

/**
 * Normalize one raw GitHub release into a download surface: trim a leading "v"
 * from the tag for display and resolve its assets into typed binary rows.
 */
export function normalizeRelease(release: RawRelease): DownloadSurface {
  return {
    version: release.tag_name.replace(/^v/, ""),
    releaseUrl: release.html_url,
    publishedAt: release.published_at,
    binaries: matchBinaries(release.assets),
  };
}

/** The newest release of a list by publish date, or null when the list is empty. */
function newestSurface(releases: RawRelease[]): DownloadSurface | null {
  if (releases.length === 0) return null;
  const newest = [...releases].sort((a, b) => b.published_at.localeCompare(a.published_at))[0];
  return normalizeRelease(newest);
}

/**
 * Normalize the raw, committed downloads data into the published shape: the
 * newest release per surface (or null), carrying the generation timestamp.
 */
export function normalizeDownloads(raw: RawDownloads): Downloads {
  return {
    generatedAt: raw.generated_at,
    ocis: newestSurface(raw.ocis),
    client: newestSurface(raw.client),
    android: newestSurface(raw.android),
    ios: newestSurface(raw.ios),
  };
}
